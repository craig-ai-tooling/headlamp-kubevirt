import { Icon } from '@iconify/react';
import { Resource } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, Card, CardContent, Chip, Grid, IconButton, Tooltip, Typography } from '@mui/material';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { NADAddress, NADConfig, NADRange, NADRoute } from '../../types';
import { parseNADConfig } from '../../utils/nadConfig';
import CreateResourceDialog from '../common/CreateResourceDialog';
import NADForm from './NADForm';
import NetworkAttachmentDefinition from './NetworkAttachmentDefinition';

const TYPE_COLORS: Record<
  string,
  'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error'
> = {
  bridge: 'primary',
  macvlan: 'secondary',
  ipvlan: 'info',
  vlan: 'warning',
  'host-device': 'success',
  sriov: 'error',
  ptp: 'info',
  tap: 'secondary',
};

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      {typeof value === 'string' ? (
        <Typography variant="body1" sx={mono ? { fontFamily: 'monospace' } : undefined}>
          {value || '-'}
        </Typography>
      ) : (
        <Box sx={{ mt: 0.5 }}>{value}</Box>
      )}
    </Box>
  );
}

export default function NADDetails() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const [nad] = NetworkAttachmentDefinition.useGet(name, namespace);
  const [editOpen, setEditOpen] = useState(false);

  if (!nad) return null;

  const config: NADConfig = parseNADConfig(nad.getConfig());

  const cniType = config.type || 'unknown';
  const ipam = config.ipam || {};
  const ipamType = !ipam || Object.keys(ipam).length === 0 ? 'none' : ipam.type || 'none';

  return (
    <>
      <Resource.DetailsGrid
        resourceType={NetworkAttachmentDefinition}
        name={name}
        namespace={namespace}
        withEvents
        actions={[
          <Tooltip title="Edit with Wizard">
            <IconButton key="edit-wizard" onClick={() => setEditOpen(true)} size="small">
              <Icon icon="mdi:auto-fix" />
            </IconButton>
          </Tooltip>,
        ]}
      />
      <Grid container spacing={3} sx={{ mt: 2, px: 2 }}>
        {/* Overview */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Icon icon="mdi:information-outline" />
                <Typography variant="h6">Overview</Typography>
              </Box>
              <InfoRow label="Name" value={nad.getName()} mono />
              <InfoRow label="Namespace" value={nad.getNamespace()} />
              <InfoRow
                label="CNI Type"
                value={
                  <Chip label={cniType} size="small" color={TYPE_COLORS[cniType] || 'default'} />
                }
              />
              <InfoRow label="CNI Version" value={config.cniVersion || '-'} mono />
              <InfoRow
                label="IPAM"
                value={<Chip label={ipamType} size="small" variant="outlined" />}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* CNI Configuration */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Icon icon="mdi:tune" />
                <Typography variant="h6">
                  {cniType.charAt(0).toUpperCase() + cniType.slice(1)} Configuration
                </Typography>
              </Box>

              {cniType === 'bridge' && (
                <>
                  <InfoRow label="Bridge Name" value={config.bridge} mono />
                  <InfoRow
                    label="MTU"
                    value={config.mtu !== null ? String(config.mtu) : 'Default'}
                  />
                  {config.vlan !== null && <InfoRow label="VLAN Tag" value={String(config.vlan)} />}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                    {config.isGateway && <Chip label="Gateway" size="small" color="info" />}
                    {config.isDefaultGateway && (
                      <Chip label="Default Gateway" size="small" color="info" />
                    )}
                    {config.ipMasq && <Chip label="IP Masquerade" size="small" color="info" />}
                    {config.hairpinMode && <Chip label="Hairpin" size="small" />}
                    {config.promiscMode && <Chip label="Promiscuous" size="small" />}
                    {config.macspoofchk && (
                      <Chip label="MAC Spoof Check" size="small" color="warning" />
                    )}
                  </Box>
                </>
              )}

              {(cniType === 'macvlan' || cniType === 'ipvlan') && (
                <>
                  <InfoRow
                    label="Master Interface"
                    value={config.master || 'Default route interface'}
                    mono
                  />
                  <InfoRow label="Mode" value={config.mode} />
                  <InfoRow
                    label="MTU"
                    value={config.mtu !== null ? String(config.mtu) : 'Default'}
                  />
                </>
              )}

              {cniType === 'vlan' && (
                <>
                  <InfoRow label="Master Interface" value={config.master} mono />
                  <InfoRow label="VLAN ID" value={String(config.vlanId)} />
                  <InfoRow
                    label="MTU"
                    value={config.mtu !== null ? String(config.mtu) : 'Default'}
                  />
                </>
              )}

              {cniType === 'host-device' && (
                <>
                  {config.device && <InfoRow label="Device" value={config.device} mono />}
                  {config.hwaddr && <InfoRow label="MAC Address" value={config.hwaddr} mono />}
                  {config.kernelpath && (
                    <InfoRow label="Kernel Path" value={config.kernelpath} mono />
                  )}
                  {config.pciBusID && <InfoRow label="PCI Bus ID" value={config.pciBusID} mono />}
                </>
              )}

              {cniType === 'sriov' && (
                <>
                  {config.vlan !== null && <InfoRow label="VLAN" value={String(config.vlan)} />}
                  {config.vlanQoS !== null && (
                    <InfoRow label="VLAN QoS" value={String(config.vlanQoS)} />
                  )}
                  {config.vlanProto && <InfoRow label="VLAN Protocol" value={config.vlanProto} />}
                  {config.mac && <InfoRow label="MAC Address" value={config.mac} mono />}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                    {config.spoofchk && (
                      <Chip label={`Spoof Check: ${config.spoofchk}`} size="small" />
                    )}
                    {config.trust && <Chip label={`Trust: ${config.trust}`} size="small" />}
                    {config.linkState && <Chip label={`Link: ${config.linkState}`} size="small" />}
                  </Box>
                  {config.minTxRate !== null && (
                    <InfoRow label="Min TX Rate" value={`${config.minTxRate} Mbps`} />
                  )}
                  {config.maxTxRate !== null && (
                    <InfoRow label="Max TX Rate" value={`${config.maxTxRate} Mbps`} />
                  )}
                </>
              )}

              {cniType === 'ptp' && (
                <>
                  <InfoRow
                    label="MTU"
                    value={config.mtu !== null ? String(config.mtu) : 'Default'}
                  />
                  {config.ipMasq && (
                    <Chip label="IP Masquerade" size="small" color="info" sx={{ mt: 1 }} />
                  )}
                </>
              )}

              {cniType === 'tap' && (
                <>
                  {config.mac && <InfoRow label="MAC Address" value={config.mac} mono />}
                  <InfoRow
                    label="MTU"
                    value={config.mtu !== null ? String(config.mtu) : 'Default'}
                  />
                  {config.bridge && <InfoRow label="Bridge" value={config.bridge} mono />}
                  {config.selinuxcontext && (
                    <InfoRow label="SELinux Context" value={config.selinuxcontext} />
                  )}
                  {config.owner !== null && (
                    <InfoRow label="Owner (UID)" value={String(config.owner)} />
                  )}
                  {config.group !== null && (
                    <InfoRow label="Group (GID)" value={String(config.group)} />
                  )}
                  {config.multiQueue && (
                    <Chip label="Multi-Queue" size="small" color="info" sx={{ mt: 1 }} />
                  )}
                </>
              )}

              {![
                'bridge',
                'macvlan',
                'ipvlan',
                'vlan',
                'host-device',
                'sriov',
                'ptp',
                'tap',
              ].includes(cniType) && (
                <Typography variant="body2" color="text.secondary">
                  Unknown CNI type: {cniType}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* IPAM Configuration */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Icon icon="mdi:ip-network" />
                <Typography variant="h6">IPAM Configuration</Typography>
              </Box>

              {ipamType === 'none' && (
                <Typography variant="body2" color="text.secondary">
                  L2 only — no IP address management
                </Typography>
              )}

              {ipamType === 'host-local' && (
                <>
                  <InfoRow label="Type" value="Host-Local" />
                  {ipam.ranges?.map((rangeSet: NADRange[], setIdx: number) => (
                    <Box key={setIdx} sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Range Set {setIdx + 1}
                      </Typography>
                      {rangeSet.map((range: NADRange, idx: number) => (
                        <Box
                          key={idx}
                          sx={{
                            p: 1.5,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            mb: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                          }}
                        >
                          {range.subnet && <div>Subnet: {range.subnet}</div>}
                          {range.rangeStart && <div>Start: {range.rangeStart}</div>}
                          {range.rangeEnd && <div>End: {range.rangeEnd}</div>}
                          {range.gateway && <div>Gateway: {range.gateway}</div>}
                        </Box>
                      ))}
                    </Box>
                  ))}
                  {ipam.routes && ipam.routes.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Routes
                      </Typography>
                      {ipam.routes.map((route: NADRoute, idx: number) => (
                        <Box
                          key={idx}
                          sx={{
                            p: 1,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            mb: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                          }}
                        >
                          {route.dst}
                          {route.gw ? ` → ${route.gw}` : ''}
                        </Box>
                      ))}
                    </Box>
                  )}
                </>
              )}

              {ipamType === 'dhcp' && (
                <InfoRow label="Type" value="DHCP — addresses acquired from network DHCP server" />
              )}

              {ipamType === 'static' && (
                <>
                  <InfoRow label="Type" value="Static" />
                  {ipam.addresses?.map((addr: NADAddress, idx: number) => (
                    <Box
                      key={idx}
                      sx={{
                        p: 1.5,
                        bgcolor: 'action.hover',
                        borderRadius: 1,
                        mb: 1,
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                      }}
                    >
                      {addr.address}
                      {addr.gateway ? ` (gw: ${addr.gateway})` : ''}
                    </Box>
                  ))}
                  {ipam.routes && ipam.routes.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Routes
                      </Typography>
                      {ipam.routes.map((route: NADRoute, idx: number) => (
                        <Box
                          key={idx}
                          sx={{
                            p: 1,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            mb: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                          }}
                        >
                          {route.dst}
                          {route.gw ? ` → ${route.gw}` : ''}
                        </Box>
                      ))}
                    </Box>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Raw Configuration */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Icon icon="mdi:code-json" />
                <Typography variant="h6">Raw Configuration</Typography>
              </Box>
              <Box
                component="pre"
                sx={{
                  p: 2,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  overflow: 'auto',
                  maxHeight: 400,
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                  m: 0,
                }}
              >
                {JSON.stringify(config, null, 2)}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <CreateResourceDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Network Attachment Definition"
        resourceClass={NetworkAttachmentDefinition}
        initialResource={nad.jsonData}
        editMode
        formComponent={NADForm}
      />
    </>
  );
}
