/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  Bot,
  ExternalLink,
  Layers,
  ScrollText,
  Server,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CardStaggerItem } from '@/components/page-transition'
import { Button } from '@/components/ui/button'

export function ServicesHubPanel() {
  const { t } = useTranslation()

  const services = [
    {
      id: 'grok2api',
      name: 'Grok2API 控制台',
      badge: '/grok2api/',
      description: t(
        'Grok 网页转 API 服务控制台，支持账号池、Token 轮询、模型配置与生图管理。'
      ),
      url: '/grok2api/',
      icon: Bot,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10 border-violet-500/25 hover:border-violet-500/50',
      buttonBg: 'bg-violet-600 hover:bg-violet-700 text-white',
    },
    {
      id: 'grok2api-management',
      name: t('Grok2API native management'),
      badge: '/creative-console',
      description: t(
        'Open the native Grok2API management interface for accounts, tokens, and service configuration.'
      ),
      url: 'https://grok-api2.fanxiaolong.uk/creative-console',
      icon: Server,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10 border-amber-500/25 hover:border-amber-500/50',
      buttonBg: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    {
      id: 'chat2api',
      name: 'GPT2API (Chat2API)',
      badge: '/chat2api/',
      description: t(
        'ChatGPT Web-to-API 转换服务，支持官方网页端 AccessToken 鉴权与反代中转。'
      ),
      url: '/chat2api/',
      icon: Zap,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-500/50',
      buttonBg: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    },
    {
      id: 'dozzle',
      name: 'Docker 容器实时日志',
      badge: '/logs/',
      description: t(
        '集成 Dozzle 实时日志监控面板，可查看 new-api、chat2api、grok2api 容器的标准输出。'
      ),
      url: '/logs/',
      icon: ScrollText,
      color: 'text-sky-500',
      bg: 'bg-sky-500/10 border-sky-500/25 hover:border-sky-500/50',
      buttonBg: 'bg-sky-600 hover:bg-sky-700 text-white',
    },
  ]

  return (
    <CardStaggerItem className='border-border/70 bg-card rounded-2xl border p-4 shadow-sm sm:p-5'>
      <div className='border-border/50 flex items-center justify-between gap-3 border-b pb-3'>
        <div className='flex items-center gap-2.5'>
          <div className='border-primary/20 bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl border shadow-xs'>
            <Layers className='size-5' />
          </div>
          <div>
            <h3 className='text-foreground text-sm font-semibold tracking-tight sm:text-base'>
              {t('集成服务与中间件快捷跳转 (Services Hub)')}
            </h3>
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {t(
                '一键直达系统集成的 Grok2API、GPT2API 以及 Docker 容器实时日志面板'
              )}
            </p>
          </div>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-3.5 pt-3.5 md:grid-cols-2 xl:grid-cols-4'>
        {services.map((srv) => {
          const Icon = srv.icon
          return (
            <div
              key={srv.id}
              className={`flex flex-col justify-between rounded-xl border p-4 shadow-xs transition-all duration-200 ${srv.bg}`}
            >
              <div>
                <div className='mb-2 flex items-start justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    <div
                      className={`bg-background/60 rounded-lg p-1.5 shadow-xs ${srv.color}`}
                    >
                      <Icon size={18} />
                    </div>
                    <div>
                      <h4 className='text-foreground text-xs leading-snug font-semibold sm:text-sm'>
                        {srv.name}
                      </h4>
                      <span className='text-muted-foreground font-mono text-[11px]'>
                        {srv.badge}
                      </span>
                    </div>
                  </div>
                  <span className='inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400'>
                    <span className='size-1.5 animate-pulse rounded-full bg-emerald-500' />
                    在线
                  </span>
                </div>

                <p className='text-muted-foreground mt-2 text-xs leading-relaxed'>
                  {srv.description}
                </p>
              </div>

              <div className='border-border/40 mt-3 flex items-center justify-between border-t pt-3'>
                <span className='text-muted-foreground max-w-[140px] truncate font-mono text-[11px]'>
                  {srv.url}
                </span>
                <Button
                  size='sm'
                  className={`h-7 gap-1.5 px-3 text-xs font-medium shadow-xs ${srv.buttonBg}`}
                  onClick={() =>
                    window.open(srv.url, '_blank', 'noopener,noreferrer')
                  }
                >
                  <span>{t('打开面板')}</span>
                  <ExternalLink size={11} />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </CardStaggerItem>
  )
}
