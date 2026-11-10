import { describe, expect, it } from 'vitest';
import {
  buildVM,
  cloudInit,
  gi,
  initialState,
  problems,
  STORAGE_CLASS,
  templateImage,
  WizardState,
} from './vmWizard';

const template = {
  metadata: { name: 'ubuntu-dev', namespace: 'images' },
  spec: {
    parameters: [
      { name: 'NAME', required: true },
      { name: 'INSTANCETYPE', value: 'o1.2xlarge' },
      { name: 'DISK_SIZE', value: '150Gi' },
      { name: 'SSH_KEY', required: true },
      { name: 'NETWORK', value: 'default/vlan19' },
    ],
    virtualMachine: {
      apiVersion: 'kubevirt.io/v1',
      kind: 'VirtualMachine',
      metadata: { name: '${NAME}' },
      spec: {
        runStrategy: 'Always',
        instancetype: { kind: 'VirtualMachineClusterInstancetype', name: '${INSTANCETYPE}' },
        dataVolumeTemplates: [
          {
            metadata: { name: '${NAME}-root' },
            spec: {
              sourceRef: { kind: 'DataSource', name: 'ubuntu-2404', namespace: 'images' },
              storage: {
                resources: { requests: { storage: '${DISK_SIZE}' } },
                storageClassName: 'spindle-rwx-block',
              },
            },
          },
        ],
        template: {
          spec: {
            domain: { devices: {} },
            networks: [{ name: 'vlan19', multus: { networkName: '${NETWORK}' } }],
            volumes: [{ name: 'cloudinit', cloudInitNoCloud: { userData: 'key: ${SSH_KEY}' } }],
          },
        },
      },
    },
  },
};

const base = (o: Partial<WizardState>): WizardState => ({
  ...initialState(),
  name: 'web-01',
  sshKey: 'ssh-ed25519 AAA me',
  ...o,
});

describe('quick create', () => {
  it('builds from scratch with the size, disk, clone mode and cloud-init', () => {
    const vm = buildVM(
      base({
        source: { kind: 'image', image: { name: 'ubuntu-2404', namespace: 'images' } },
        size: 'small',
        cpu: 2,
        memoryGi: 4,
        cloneMode: 'full',
      })
    )!;
    expect(vm.metadata).toEqual({ name: 'web-01', namespace: 'default' });
    expect(vm.spec.template.spec.domain.cpu).toEqual({ cores: 2, sockets: 1, threads: 1 });
    expect(vm.spec.template.spec.domain.memory).toEqual({ guest: '4Gi' });
    const dvt = vm.spec.dataVolumeTemplates[0];
    expect(dvt.spec.storage.storageClassName).toBe(STORAGE_CLASS.full);
    expect(dvt.spec.storage.resources.requests.storage).toBe('30Gi');
    expect(vm.spec.template.spec.networks[0]).toEqual({
      name: 'vlan19',
      multus: { networkName: 'default/vlan19' },
    });
    expect(vm.spec.template.spec.volumes[1].cloudInitNoCloud.userData).toContain(
      'ssh-ed25519 AAA me'
    );
  });
  it('fills a template and keeps its size when asked', () => {
    const vm = buildVM(
      base({ source: { kind: 'template', template }, size: 'template', diskGi: 150 })
    )!;
    expect(vm.metadata.name).toBe('web-01');
    expect(vm.spec.instancetype.name).toBe('o1.2xlarge');
    expect(vm.spec.dataVolumeTemplates[0].metadata.name).toBe('web-01-root');
    expect(vm.spec.dataVolumeTemplates[0].spec.storage.storageClassName).toBe(STORAGE_CLASS.linked);
    expect(vm.spec.template.spec.volumes[0].cloudInitNoCloud.userData).toBe(
      'key: ssh-ed25519 AAA me'
    );
    expect(vm.spec.template.spec.domain.cpu).toBeUndefined();
  });
  it('overrides a template size with CPU and memory', () => {
    const vm = buildVM(
      base({
        source: { kind: 'template', template },
        size: 'large',
        cpu: 8,
        memoryGi: 16,
        start: false,
      })
    )!;
    expect(vm.spec.instancetype).toBeUndefined();
    expect(vm.spec.template.spec.domain.memory.guest).toBe('16Gi');
    expect(vm.spec.runStrategy).toBe('Halted');
  });
  it('adds advanced extras', () => {
    const vm = buildVM(
      base({
        source: { kind: 'image', image: { name: 'x', namespace: 'images' } },
        network: '',
        advanced: { userData: '', instancetype: '', nodeName: 'smc14', extraDisksGi: [50] },
      })
    )!;
    expect(vm.spec.template.spec.nodeSelector).toEqual({ 'kubernetes.io/hostname': 'smc14' });
    expect(vm.spec.dataVolumeTemplates[1].metadata.name).toBe('web-01-data-1');
    expect(vm.spec.template.spec.networks[0]).toEqual({ name: 'default', pod: {} });
  });
  it('honours the network choice on a template', () => {
    const pod = buildVM(
      base({ source: { kind: 'template', template }, size: 'template', network: '' })
    )!;
    expect(pod.spec.template.spec.networks).toEqual([{ name: 'default', pod: {} }]);
    expect(pod.spec.template.spec.domain.devices.interfaces).toEqual([
      { name: 'default', masquerade: {}, model: 'virtio' },
    ]);
    const other = buildVM(
      base({ source: { kind: 'template', template }, size: 'template', network: 'lab/vlan30' })
    )!;
    expect(other.spec.template.spec.networks[0].multus.networkName).toBe('lab/vlan30');
  });
  it('puts extra disks on the chosen clone class', () => {
    const vm = buildVM(
      base({
        source: { kind: 'image', image: { name: 'x', namespace: 'images' } },
        cloneMode: 'full',
        advanced: { userData: '', instancetype: '', nodeName: '', extraDisksGi: [5] },
      })
    )!;
    expect(
      vm.spec.dataVolumeTemplates.map(
        (d: { spec: { storage: { storageClassName: string } } }) => d.spec.storage.storageClassName
      )
    ).toEqual([STORAGE_CLASS.full, STORAGE_CLASS.full]);
  });
  it('explains what is missing', () => {
    expect(problems(initialState())).toEqual(
      expect.arrayContaining(['Pick a template or an OS image.'])
    );
    expect(
      problems(
        base({
          source: { kind: 'image', image: { name: 'x', namespace: 'i' } },
          name: 'Bad_Name',
          sshKey: '',
        })
      ).length
    ).toBe(2);
  });
  it('helpers', () => {
    expect(templateImage(template)).toEqual({ name: 'ubuntu-2404', namespace: 'images' });
    expect(gi('150Gi')).toBe(150);
    expect(gi('1Ti')).toBe(1024);
    expect(gi('5G')).toBeUndefined();
    expect(
      cloudInit(
        base({
          advanced: {
            userData: '#cloud-config\n',
            instancetype: '',
            nodeName: '',
            extraDisksGi: [],
          },
        })
      )
    ).toBe('#cloud-config\n');
  });
});
