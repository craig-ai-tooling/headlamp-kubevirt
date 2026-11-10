// The Quick create wizard's answers -> one VirtualMachine. Pure, so the review step's YAML is
// exactly what gets created.
import { substituteParams } from '../../utils/templateUtils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

export type CloneMode = 'linked' | 'full';
export const STORAGE_CLASS: Record<CloneMode, string> = {
  linked: 'spindle-rwx-block',
  full: 'spindle-rwx-block-full',
};

export const SIZES = [
  { id: 'small', label: 'Small', cpu: 2, memoryGi: 4, hint: 'light services, a test box' },
  { id: 'medium', label: 'Medium', cpu: 4, memoryGi: 8, hint: 'most apps and dev work' },
  { id: 'large', label: 'Large', cpu: 8, memoryGi: 16, hint: 'builds, databases, heavy dev' },
];

export interface Ref {
  name: string;
  namespace: string;
}

export interface WizardState {
  source: { kind: 'template'; template: Obj } | { kind: 'image'; image: Ref } | null;
  /** 'template' keeps the template's own size (its instancetype) */
  size: 'template' | 'custom' | string;
  cpu: number;
  memoryGi: number;
  diskGi: number;
  cloneMode: CloneMode;
  name: string;
  namespace: string;
  user: string;
  sshKey: string;
  /** namespace/name of a NetworkAttachmentDefinition, or '' for the pod network */
  network: string;
  start: boolean;
  advanced: { userData: string; instancetype: string; nodeName: string; extraDisksGi: number[] };
}

export const NAME_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

export function initialState(): WizardState {
  return {
    source: null,
    size: 'medium',
    cpu: 4,
    memoryGi: 8,
    diskGi: 30,
    cloneMode: 'linked',
    name: '',
    namespace: 'default',
    user: 'ubuntu',
    sshKey: '',
    network: 'default/vlan19',
    start: true,
    advanced: { userData: '', instancetype: '', nodeName: '', extraDisksGi: [] },
  };
}

/** The DataSource a template's first disk clones from, if any. */
export function templateImage(t: Obj): Ref | null {
  const ref = t?.spec?.virtualMachine?.spec?.dataVolumeTemplates?.[0]?.spec?.sourceRef;
  return ref?.kind === 'DataSource'
    ? { name: ref.name, namespace: ref.namespace || t.metadata?.namespace }
    : null;
}

export function templateParam(t: Obj, name: string): string | undefined {
  return (t?.spec?.parameters || []).find((p: Obj) => p.name === name)?.value;
}

/** "150Gi" -> 150; anything else -> undefined. */
export function gi(q?: string): number | undefined {
  const m = /^(\d+)(Gi|Ti)$/.exec(q || '');
  return m ? Number(m[1]) * (m[2] === 'Ti' ? 1024 : 1) : undefined;
}

export function cloudInit(s: WizardState): string {
  if (s.advanced.userData.trim()) {
    return s.advanced.userData;
  }
  const lines = [
    '#cloud-config',
    'users:',
    `  - name: ${s.user || 'ubuntu'}`,
    '    sudo: ALL=(ALL) NOPASSWD:ALL',
    '    shell: /bin/bash',
  ];
  if (s.sshKey.trim()) {
    lines.push('    ssh_authorized_keys:', `      - ${s.sshKey.trim()}`);
  }
  lines.push(
    'packages:',
    '  - qemu-guest-agent',
    'runcmd:',
    '  - [systemctl, enable, --now, qemu-guest-agent]'
  );
  return lines.join('\n') + '\n';
}

/** Problems that stop Create, in plain words. */
export function problems(s: WizardState): string[] {
  const out: string[] = [];
  if (!s.source) out.push('Pick a template or an OS image.');
  if (!NAME_RE.test(s.name))
    out.push('The name must be lowercase letters, digits and dashes (for example web-01).');
  if (!s.namespace) out.push('Pick a namespace.');
  if (s.size === 'custom' && (!(s.cpu >= 1) || !(s.memoryGi >= 1)))
    out.push('Give at least 1 CPU and 1 GiB of memory.');
  if (!(s.diskGi >= 1)) out.push('The disk needs at least 1 GiB.');
  if (s.source?.kind === 'image' && !s.sshKey.trim() && !s.advanced.userData.trim())
    out.push('Add an SSH key so you can log in (or custom cloud-init under Advanced).');
  return out;
}

const nadName = (n: string) => n.split('/').pop() || n;

function fromScratch(s: WizardState, image: Ref): Obj {
  const net = s.network
    ? {
        iface: { name: nadName(s.network), bridge: {}, model: 'virtio' },
        net: { name: nadName(s.network), multus: { networkName: s.network } },
      }
    : {
        iface: { name: 'default', masquerade: {}, model: 'virtio' },
        net: { name: 'default', pod: {} },
      };
  return {
    apiVersion: 'kubevirt.io/v1',
    kind: 'VirtualMachine',
    metadata: { name: s.name, namespace: s.namespace },
    spec: {
      runStrategy: s.start ? 'Always' : 'Halted',
      dataVolumeTemplates: [
        {
          metadata: { name: `${s.name}-root` },
          spec: {
            sourceRef: { kind: 'DataSource', name: image.name, namespace: image.namespace },
            storage: {
              accessModes: ['ReadWriteMany'],
              volumeMode: 'Block',
              resources: { requests: { storage: `${s.diskGi}Gi` } },
              storageClassName: STORAGE_CLASS[s.cloneMode],
            },
          },
        },
      ],
      template: {
        metadata: { labels: { 'kubevirt.io/domain': s.name } },
        spec: {
          evictionStrategy: 'LiveMigrate',
          domain: {
            devices: {
              disks: [
                { name: 'root', bootOrder: 1, disk: { bus: 'virtio' } },
                { name: 'cloudinit', disk: { bus: 'virtio' } },
              ],
              interfaces: [net.iface],
              rng: {},
              autoattachMemBalloon: true,
            },
          },
          networks: [net.net],
          volumes: [
            { name: 'root', dataVolume: { name: `${s.name}-root` } },
            { name: 'cloudinit', cloudInitNoCloud: { userData: cloudInit(s) } },
          ],
        },
      },
    },
  };
}

function fromTemplate(s: WizardState, t: Obj): Obj {
  const params = (t.spec?.parameters || []) as Array<{ name: string; value?: string }>;
  const values: Record<string, string> = { NAME: s.name, DISK_SIZE: `${s.diskGi}Gi` };
  if (s.sshKey.trim()) values.SSH_KEY = s.sshKey.trim();
  if (s.network) values.NETWORK = s.network;
  const vm = JSON.parse(
    substituteParams(JSON.stringify(t.spec?.virtualMachine || {}), params, values)
  );
  vm.apiVersion = vm.apiVersion || 'kubevirt.io/v1';
  vm.kind = vm.kind || 'VirtualMachine';
  vm.metadata = { ...(vm.metadata || {}), name: s.name, namespace: s.namespace };
  vm.spec = vm.spec || {};
  vm.spec.runStrategy = s.start ? 'Always' : 'Halted';
  delete vm.spec.running;
  for (const dvt of vm.spec.dataVolumeTemplates || []) {
    dvt.spec = dvt.spec || {};
    dvt.spec.storage = {
      ...(dvt.spec.storage || {}),
      storageClassName: STORAGE_CLASS[s.cloneMode],
    };
  }
  const first = vm.spec.dataVolumeTemplates?.[0];
  if (first) {
    first.spec.storage.resources = { requests: { storage: `${s.diskGi}Gi` } };
  }
  return vm;
}

function applySize(vm: Obj, s: WizardState) {
  const domain = ((vm.spec.template = vm.spec.template || {}).spec = vm.spec.template.spec || {});
  const d = (domain.domain = domain.domain || {});
  if (s.advanced.instancetype) {
    vm.spec.instancetype = {
      kind: 'VirtualMachineClusterInstancetype',
      name: s.advanced.instancetype,
    };
    delete d.cpu;
    delete d.memory;
    delete d.resources;
    return;
  }
  if (s.size === 'template' && vm.spec.instancetype) {
    return;
  }
  delete vm.spec.instancetype;
  d.cpu = { cores: s.cpu, sockets: 1, threads: 1 };
  d.memory = { guest: `${s.memoryGi}Gi` };
  d.resources = {
    ...(d.resources || {}),
    requests: { ...(d.resources?.requests || {}), memory: `${s.memoryGi}Gi` },
  };
}

function applyAdvanced(vm: Obj, s: WizardState) {
  const spec = vm.spec.template.spec;
  if (s.advanced.nodeName) {
    spec.nodeSelector = {
      ...(spec.nodeSelector || {}),
      'kubernetes.io/hostname': s.advanced.nodeName,
    };
  }
  s.advanced.extraDisksGi.forEach((size, i) => {
    const n = `${s.name}-data-${i + 1}`;
    vm.spec.dataVolumeTemplates = vm.spec.dataVolumeTemplates || [];
    vm.spec.dataVolumeTemplates.push({
      metadata: { name: n },
      spec: {
        source: { blank: {} },
        storage: {
          accessModes: ['ReadWriteMany'],
          volumeMode: 'Block',
          resources: { requests: { storage: `${size}Gi` } },
          storageClassName: STORAGE_CLASS.linked,
        },
      },
    });
    spec.domain.devices = spec.domain.devices || {};
    spec.domain.devices.disks = [
      ...(spec.domain.devices.disks || []),
      { name: `data-${i + 1}`, disk: { bus: 'virtio' } },
    ];
    spec.volumes = [...(spec.volumes || []), { name: `data-${i + 1}`, dataVolume: { name: n } }];
  });
}

export function buildVM(s: WizardState): Obj | null {
  if (!s.source) {
    return null;
  }
  const vm =
    s.source.kind === 'template'
      ? fromTemplate(s, s.source.template)
      : fromScratch(s, s.source.image);
  applySize(vm, s);
  applyAdvanced(vm, s);
  return vm;
}

/** One-line plain summary for the review step. */
export function summary(s: WizardState): string[] {
  const src =
    s.source?.kind === 'template'
      ? `template ${s.source.template.metadata?.name}`
      : s.source
      ? `image ${s.source.image.namespace}/${s.source.image.name}`
      : '-';
  const size = s.advanced.instancetype
    ? `instance type ${s.advanced.instancetype}`
    : s.size === 'template'
    ? "the template's size"
    : `${s.cpu} CPU, ${s.memoryGi} GiB memory`;
  return [
    `${s.namespace}/${s.name || '?'} from ${src}`,
    size,
    `${s.diskGi} GiB disk, ${
      s.cloneMode === 'linked'
        ? 'linked clone (fast, shares the template disk)'
        : 'independent copy (copied in the background)'
    }`,
    s.network ? `network ${s.network}` : 'pod network',
    s.start ? 'starts right away' : 'created stopped',
  ];
}
