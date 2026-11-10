// Quick create: a VM in five plain questions (start from, size, disk, name and access, review).
// The full form stays one click away ("Advanced form").
import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { dumpYaml } from '../../utils/templateUtils';
import {
  buildVM,
  CloneMode,
  gi,
  initialState,
  problems,
  SIZES,
  STORAGE_CLASS,
  summary,
  templateImage,
  templateParam,
  WizardState,
} from './vmWizard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

const STEPS = ['Start from', 'Size', 'Disk', 'Name and access', 'Review'];
const SSH_KEY_STORE = 'kubevirt-quickcreate-ssh-key';

function list(path: string): Promise<Obj[]> {
  return ApiProxy.request(path)
    .then((l: Obj) => l.items || [])
    .catch(() => []);
}

function Choice(props: {
  selected: boolean;
  title: string;
  text: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: props.selected ? 'primary.main' : undefined,
        borderWidth: props.selected ? 2 : 1,
        opacity: props.disabled ? 0.5 : 1,
      }}
    >
      <CardActionArea onClick={props.onClick} disabled={props.disabled} sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600}>
            {props.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {props.text}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 2,
  my: 2,
};

function Progress(props: { vm: Obj }) {
  const ns = props.vm.metadata.namespace;
  const name = props.vm.metadata.name;
  const dvName = props.vm.spec?.dataVolumeTemplates?.[0]?.metadata?.name;
  const [dv, setDv] = useState<Obj | null>(null);
  const [vmi, setVmi] = useState<Obj | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      if (dvName)
        ApiProxy.request(`/apis/cdi.kubevirt.io/v1beta1/namespaces/${ns}/datavolumes/${dvName}`)
          .then((d: Obj) => live && setDv(d))
          .catch(() => {});
      ApiProxy.request(`/apis/kubevirt.io/v1/namespaces/${ns}/virtualmachineinstances/${name}`)
        .then((v: Obj) => live && setVmi(v))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [ns, name, dvName]);
  const pct = parseFloat(String(dv?.status?.progress || '').replace('%', ''));
  const ip = (vmi?.status?.interfaces || []).map((i: Obj) => i.ipAddress).find(Boolean);
  const rows = [
    {
      label: 'Disk',
      value:
        dv?.status?.phase === 'Succeeded'
          ? 'ready'
          : dv?.status?.phase
          ? `${dv.status.phase}${Number.isFinite(pct) ? ` ${pct.toFixed(0)}%` : ''}`
          : 'waiting',
    },
    {
      label: 'VM',
      value:
        vmi?.status?.phase ||
        (props.vm.spec.runStrategy === 'Halted' ? 'created, stopped' : 'starting'),
    },
    {
      label: 'IP address',
      value: ip || (vmi?.status?.phase === 'Running' ? 'waiting for the guest agent' : '-'),
    },
  ];
  return (
    <Box>
      <Alert severity="success" sx={{ mb: 2 }}>
        Created {ns}/{name}.
      </Alert>
      {dv?.status?.phase && dv.status.phase !== 'Succeeded' && (
        <LinearProgress
          variant={Number.isFinite(pct) ? 'determinate' : 'indeterminate'}
          value={Number.isFinite(pct) ? pct : 0}
          sx={{ mb: 2 }}
        />
      )}
      {rows.map(r => (
        <Typography key={r.label}>
          <b>{r.label}:</b> {r.value}
        </Typography>
      ))}
    </Box>
  );
}

export default function QuickCreateVM(props: {
  open: boolean;
  onClose: () => void;
  onAdvanced: () => void;
}) {
  const [step, setStep] = useState(0);
  const [s, setS] = useState<WizardState>(initialState);
  const [templates, setTemplates] = useState<Obj[]>([]);
  const [images, setImages] = useState<Obj[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [nads, setNads] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [instancetypes, setInstancetypes] = useState<string[]>([]);
  const [showYaml, setShowYaml] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Obj | null>(null);
  const set = (p: Partial<WizardState>) => setS(o => ({ ...o, ...p }));
  const adv = (p: Partial<WizardState['advanced']>) =>
    setS(o => ({ ...o, advanced: { ...o.advanced, ...p } }));

  useEffect(() => {
    if (!props.open) return;
    setStep(0);
    setCreated(null);
    setError('');
    setS({ ...initialState(), sshKey: localStorage.getItem(SSH_KEY_STORE) || '' });
    list('/apis/template.kubevirt.io/v1beta1/virtualmachinetemplates').then(setTemplates);
    list('/apis/cdi.kubevirt.io/v1beta1/datasources').then(setImages);
    list('/api/v1/namespaces').then(l => setNamespaces(l.map(n => n.metadata.name).sort()));
    list('/apis/k8s.cni.cncf.io/v1/network-attachment-definitions').then(l =>
      setNads(l.map(n => `${n.metadata.namespace}/${n.metadata.name}`).sort())
    );
    list('/apis/storage.k8s.io/v1/storageclasses').then(l =>
      setClasses(l.map(c => c.metadata.name))
    );
    list('/apis/instancetype.kubevirt.io/v1beta1/virtualmachineclusterinstancetypes').then(l =>
      setInstancetypes(l.map(c => c.metadata.name).sort())
    );
  }, [props.open]);

  const pickTemplate = (t: Obj) => {
    const disk =
      gi(templateParam(t, 'DISK_SIZE')) ||
      gi(
        t.spec?.virtualMachine?.spec?.dataVolumeTemplates?.[0]?.spec?.storage?.resources?.requests
          ?.storage
      ) ||
      30;
    const hasType = !!t.spec?.virtualMachine?.spec?.instancetype;
    set({
      source: { kind: 'template', template: t },
      diskGi: disk,
      size: hasType ? 'template' : 'medium',
      network: templateParam(t, 'NETWORK') || s.network,
    });
  };
  const pickSize = (id: string) => {
    const p = SIZES.find(x => x.id === id);
    set(p ? { size: id, cpu: p.cpu, memoryGi: p.memoryGi } : { size: id });
  };
  const fullAvailable = classes.includes(STORAGE_CLASS.full);
  const vm = buildVM(s);
  const issues = problems(s);
  const stepOk = [
    !!s.source,
    s.size !== 'custom' || (s.cpu >= 1 && s.memoryGi >= 1),
    s.diskGi >= 1,
    issues.length === 0,
    issues.length === 0,
  ];

  const create = async () => {
    if (!vm) return;
    setCreating(true);
    setError('');
    try {
      await ApiProxy.request(`/apis/kubevirt.io/v1/namespaces/${s.namespace}/virtualmachines`, {
        method: 'POST',
        body: JSON.stringify(vm),
        headers: { 'Content-Type': 'application/json' },
      });
      if (s.sshKey.trim()) localStorage.setItem(SSH_KEY_STORE, s.sshKey.trim());
      setCreated(vm);
    } catch (e: unknown) {
      setError(String((e as Obj)?.message || e));
    } finally {
      setCreating(false);
    }
  };

  const body = () => {
    if (created) return <Progress vm={created} />;
    switch (step) {
      case 0:
        return (
          <>
            <Typography>
              Start from a template (a ready-made VM), or from scratch with just an OS image.
            </Typography>
            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              Templates
            </Typography>
            <Box sx={grid}>
              {templates.map(t => (
                <Choice
                  key={`${t.metadata.namespace}/${t.metadata.name}`}
                  selected={s.source?.kind === 'template' && s.source.template === t}
                  title={t.metadata.name}
                  text={t.spec?.message || `from ${templateImage(t)?.name || 'its own disks'}`}
                  onClick={() => pickTemplate(t)}
                />
              ))}
              {templates.length === 0 && (
                <Typography color="text.secondary">
                  No templates yet. Save a VM as a template from its menu, or create one under
                  Templates.
                </Typography>
              )}
            </Box>
            <Typography variant="subtitle2">From scratch: pick an OS image</Typography>
            <Box sx={grid}>
              {images.map(d => (
                <Choice
                  key={`${d.metadata.namespace}/${d.metadata.name}`}
                  selected={
                    s.source?.kind === 'image' &&
                    s.source.image.name === d.metadata.name &&
                    s.source.image.namespace === d.metadata.namespace
                  }
                  title={d.metadata.name}
                  text={`OS image in ${d.metadata.namespace}`}
                  onClick={() =>
                    set({
                      source: {
                        kind: 'image',
                        image: { name: d.metadata.name, namespace: d.metadata.namespace },
                      },
                      size: s.size === 'template' ? 'medium' : s.size,
                    })
                  }
                />
              ))}
              {images.length === 0 && (
                <Typography color="text.secondary">No OS images (DataSources) found.</Typography>
              )}
            </Box>
          </>
        );
      case 1:
        return (
          <>
            <Typography>How big should it be?</Typography>
            <Box sx={grid}>
              {s.source?.kind === 'template' &&
                s.source.template.spec?.virtualMachine?.spec?.instancetype && (
                  <Choice
                    selected={s.size === 'template'}
                    title="Template default"
                    text="the size the template was made with"
                    onClick={() => pickSize('template')}
                  />
                )}
              {SIZES.map(p => (
                <Choice
                  key={p.id}
                  selected={s.size === p.id}
                  title={`${p.label}: ${p.cpu} CPU, ${p.memoryGi} GiB`}
                  text={p.hint}
                  onClick={() => pickSize(p.id)}
                />
              ))}
              <Choice
                selected={s.size === 'custom'}
                title="Custom"
                text="pick CPUs and memory yourself"
                onClick={() => pickSize('custom')}
              />
            </Box>
            {s.size === 'custom' && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  type="number"
                  label="CPUs"
                  value={s.cpu}
                  onChange={e => set({ cpu: Number(e.target.value) })}
                  inputProps={{ min: 1, max: 64 }}
                />
                <TextField
                  type="number"
                  label="Memory (GiB)"
                  value={s.memoryGi}
                  onChange={e => set({ memoryGi: Number(e.target.value) })}
                  inputProps={{ min: 1, max: 512 }}
                />
              </Box>
            )}
          </>
        );
      case 2:
        return (
          <>
            <TextField
              type="number"
              label="Disk size (GiB)"
              value={s.diskGi}
              onChange={e => set({ diskGi: Number(e.target.value) })}
              inputProps={{ min: 1 }}
              sx={{ mb: 1 }}
            />
            <Typography sx={{ mt: 2 }}>How should the disk be made from the image?</Typography>
            <Box sx={grid}>
              <Choice
                selected={s.cloneMode === 'linked'}
                title="Linked clone (fast)"
                text="Ready in seconds and uses almost no space at first: Spindle stores only what this VM changes and reads the rest from the template's disk. It stays tied to that disk while it exists."
                onClick={() => set({ cloneMode: 'linked' as CloneMode })}
              />
              <Choice
                selected={s.cloneMode === 'full'}
                disabled={!fullAvailable}
                title="Independent copy"
                text={
                  fullAvailable
                    ? 'Also boots right away, but Spindle copies the whole disk in the background, then cuts the tie. Uses the full disk space, and the copy adds background disk load.'
                    : `Needs the ${STORAGE_CLASS.full} StorageClass, which this cluster does not have yet.`
                }
                onClick={() => set({ cloneMode: 'full' as CloneMode })}
              />
            </Box>
          </>
        );
      case 3:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={s.name}
              onChange={e => set({ name: e.target.value.toLowerCase() })}
              helperText="lowercase letters, digits and dashes, for example web-01"
            />
            <TextField
              select
              label="Namespace"
              value={s.namespace}
              onChange={e => set({ namespace: e.target.value })}
            >
              {(namespaces.length ? namespaces : [s.namespace]).map(n => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="SSH public key"
              value={s.sshKey}
              onChange={e => set({ sshKey: e.target.value })}
              multiline
              minRows={2}
              helperText="remembered in this browser for next time"
            />
            <TextField
              select
              label="Network"
              SelectProps={{ displayEmpty: true }}
              InputLabelProps={{ shrink: true }}
              value={s.network}
              onChange={e => set({ network: e.target.value })}
            >
              <MenuItem value="">Pod network (cluster only, NAT)</MenuItem>
              {[...new Set([...(s.network ? [s.network] : []), ...nads])].map(n => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Switch checked={s.start} onChange={e => set({ start: e.target.checked })} />
              }
              label="Start it right away"
            />
            <Accordion>
              <AccordionSummary>Advanced (optional)</AccordionSummary>
              <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {s.source?.kind === 'image' && (
                  <TextField
                    label="Login user"
                    value={s.user}
                    onChange={e => set({ user: e.target.value })}
                  />
                )}
                {s.source?.kind === 'image' && (
                  <TextField
                    label="Custom cloud-init user-data (replaces the generated one)"
                    value={s.advanced.userData}
                    onChange={e => adv({ userData: e.target.value })}
                    multiline
                    minRows={4}
                  />
                )}
                <TextField
                  select
                  label="Instance type (instead of CPU and memory)"
                  value={s.advanced.instancetype}
                  onChange={e => adv({ instancetype: e.target.value })}
                >
                  <MenuItem value="">none</MenuItem>
                  {instancetypes.map(n => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Run on host (node name, blank for any)"
                  value={s.advanced.nodeName}
                  onChange={e => adv({ nodeName: e.target.value })}
                />
                <TextField
                  label="Extra blank disks (GiB, comma separated)"
                  value={s.advanced.extraDisksGi.join(', ')}
                  onChange={e =>
                    adv({
                      extraDisksGi: e.target.value
                        .split(',')
                        .map(x => Number(x.trim()))
                        .filter(x => x > 0),
                    })
                  }
                />
              </AccordionDetails>
            </Accordion>
          </Box>
        );
      default:
        return (
          <>
            {summary(s).map(l => (
              <Typography key={l}>• {l}</Typography>
            ))}
            {issues.map(i => (
              <Alert key={i} severity="warning" sx={{ mt: 1 }}>
                {i}
              </Alert>
            ))}
            <Button size="small" sx={{ mt: 2 }} onClick={() => setShowYaml(v => !v)}>
              {showYaml ? 'Hide YAML' : 'Show YAML'}
            </Button>
            <Collapse in={showYaml}>
              <Box
                component="pre"
                sx={{
                  fontSize: 12,
                  p: 1,
                  bgcolor: 'action.hover',
                  overflow: 'auto',
                  maxHeight: 360,
                }}
              >
                {vm ? dumpYaml(vm) : ''}
              </Box>
            </Collapse>
          </>
        );
    }
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="md">
      <DialogTitle>New virtual machine</DialogTitle>
      <DialogContent>
        {!created && (
          <Stepper activeStep={step} sx={{ mb: 3 }}>
            {STEPS.map(l => (
              <Step key={l}>
                <StepLabel>{l}</StepLabel>
              </Step>
            ))}
          </Stepper>
        )}
        {body()}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {!created && (
          <Button onClick={props.onAdvanced} sx={{ mr: 'auto' }}>
            Advanced form
          </Button>
        )}
        <Button onClick={props.onClose}>{created ? 'Close' : 'Cancel'}</Button>
        {!created && step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
        {!created && step < STEPS.length - 1 && (
          <Button
            variant="contained"
            disabled={!stepOk[step] && step !== 3}
            onClick={() => setStep(step + 1)}
          >
            Next
          </Button>
        )}
        {!created && step === STEPS.length - 1 && (
          <Button variant="contained" disabled={issues.length > 0 || creating} onClick={create}>
            {creating ? 'Creating…' : 'Create VM'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
