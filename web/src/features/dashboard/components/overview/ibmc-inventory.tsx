import { useTranslation } from 'react-i18next'

const LABELS: Record<string, string> = {
  chipset: 'Chipset',
  firmware: 'Firmware',
  cpuprofile: 'CPU profile',
  paravirtprovider: 'Paravirtualization',
  graphicscontroller: 'Graphics controller',
  vram: 'Video memory (MB)',
  nic1: 'Network attachment',
  nictype1: 'Network adapter',
  cableconnected1: 'Network cable',
  macaddress1: 'MAC address',
  uart1: 'Serial I/O and IRQ',
  uarttype1: 'Serial controller',
  boot1: 'First boot device',
  boot2: 'Second boot device',
  boot3: 'Third boot device',
  boot4: 'Fourth boot device',
}
const VALUES: Record<string, string> = {
  on: 'Enabled',
  off: 'Disabled',
  default: 'Default',
  disk: 'Hard disk',
  dvd: 'Virtual DVD',
  net: 'Network boot (PXE)',
  none: 'None',
}
export function IBMCInventory(props: { inventory: Record<string, string> }) {
  const { t } = useTranslation()
  return (
    <dl className='grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2'>
      {Object.entries(props.inventory).map(([key, value]) => (
        <div className='flex justify-between gap-3 border-b py-2' key={key}>
          <dt className='text-muted-foreground' title={key}>
            {t(LABELS[key] ?? key)}
          </dt>
          <dd
            className='max-w-[60%] text-right font-mono break-all'
            title={value}
          >
            {t(VALUES[value] ?? value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
