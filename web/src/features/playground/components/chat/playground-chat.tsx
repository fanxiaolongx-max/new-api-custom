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
import { BotIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Loader } from '@/components/ai-elements/loader'
import { Message } from '@/components/ai-elements/message'
import { cn } from '@/lib/utils'

import {
  getChatMessageRenderState,
  getEditingMessageContent,
  getMessageAlignment,
  getPreviousUserMessage,
  isErrorMessage,
} from '../../lib'
import type {
  Message as MessageType,
  PlaygroundConfig,
  PlaygroundMessageLayoutMode,
  PlaygroundMode,
} from '../../types'
import { MessageActions } from '../message/message-actions'
import { MessageErrorActions } from '../message/message-error-actions'
import { PlaygroundMessageContent } from '../message/playground-message-content'
import { PlaygroundMessageEditor } from '../message/playground-message-editor'
import { CompareResponseGrid } from '../compare/compare-response-grid'
import { PlaygroundEmptyState } from './playground-empty-state'

const MAX_RENDERED_HISTORY_MESSAGES = 24

interface PlaygroundChatProps {
  config?: PlaygroundConfig
  messages: MessageType[]
  onCopyMessage?: (message: MessageType) => void
  onRegenerateMessage?: (message: MessageType) => void
  onEditMessage?: (message: MessageType) => void
  onDeleteMessage?: (message: MessageType) => void
  onSelectPrompt?: (prompt: string) => void
  isGenerating?: boolean
  isLoadingMessages?: boolean
  editingKey?: string | null
  onSaveEdit?: (newContent: string) => void
  onCancelEdit?: (open: boolean) => void
  onSaveEditAndSubmit?: (newContent: string) => void
  messageLayoutMode?: PlaygroundMessageLayoutMode
  mode?: PlaygroundMode
}

export function PlaygroundChat({
  config,
  messages,
  onCopyMessage,
  onRegenerateMessage,
  onEditMessage,
  onDeleteMessage,
  onSelectPrompt,
  isGenerating = false,
  isLoadingMessages = false,
  editingKey,
  onSaveEdit,
  onCancelEdit,
  onSaveEditAndSubmit,
  messageLayoutMode = 'alternating',
  mode,
}: PlaygroundChatProps) {
  const { t } = useTranslation()
  const isCompare = mode === 'compare'
  const [editText, setEditText] = useState('')
  const [originalText, setOriginalText] = useState('')
  const [sourceMessageKeys, setSourceMessageKeys] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const visibleMessageOffset = Math.max(
    0,
    messages.length - MAX_RENDERED_HISTORY_MESSAGES
  )
  const visibleMessages = messages.slice(visibleMessageOffset)

  function handleToggleMessageSource(message: MessageType): void {
    setSourceMessageKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys)

      if (nextKeys.has(message.key)) {
        nextKeys.delete(message.key)
      } else {
        nextKeys.add(message.key)
      }

      return nextKeys
    })
  }

  useEffect(() => {
    if (!editingKey) return
    const content = getEditingMessageContent(messages, editingKey)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditText(content)

    setOriginalText(content)
  }, [editingKey, messages])

  let chatContent = visibleMessages.map((message, visibleMessageIndex) => {
    if (message.multiResponses && message.multiResponses.length > 0) {
      if (isCompare) {
        return (
          <div key={message.key} className='w-full my-2'>
            <CompareResponseGrid message={message} />
          </div>
        )
      }

      // Single model mode: render as standard message bubble with model switcher tabs
      const responses = message.multiResponses
      return (
        <SingleCompareMessageBubble
          key={message.key}
          message={message}
          responses={responses}
          defaultModel={config?.model}
          onCopyMessage={onCopyMessage}
          onDeleteMessage={onDeleteMessage}
          isGenerating={isGenerating}
          messageLayoutMode={messageLayoutMode}
        />
      )
    }

    const messageIndex = visibleMessageOffset + visibleMessageIndex
    const { alwaysShowActions, content, isEditing } = getChatMessageRenderState(
      messages,
      message,
      messageIndex,
      editingKey
    )
    const isError = isErrorMessage(message)
    const previousUserMessage = isError
      ? getPreviousUserMessage(messages, messageIndex)
      : null
    const alignment = getMessageAlignment(message, messageLayoutMode)
    const isSourceVisible = sourceMessageKeys.has(message.key)

    return (
      <Message
        className='group flex-row-reverse py-2.5'
        from={message.from}
        key={message.key}
      >
        <div className='w-full min-w-0 flex-1 basis-full'>
          {isEditing ? (
            <PlaygroundMessageEditor
              editText={editText}
              message={message}
              onCancelEdit={onCancelEdit}
              onEditTextChange={setEditText}
              onSaveEdit={onSaveEdit}
              onSaveEditAndSubmit={onSaveEditAndSubmit}
              originalText={originalText}
            />
          ) : (
            <PlaygroundMessageContent
              alignment={alignment}
              actions={
                <MessageActions
                  message={message}
                  onCopy={onCopyMessage}
                  onRegenerate={onRegenerateMessage}
                  onToggleSource={handleToggleMessageSource}
                  onEdit={onEditMessage}
                  onDelete={onDeleteMessage}
                  isSourceVisible={isSourceVisible}
                  isGenerating={isGenerating}
                  alwaysVisible={alwaysShowActions}
                  className='mt-1.5'
                />
              }
              isSourceVisible={isSourceVisible}
              message={message}
              errorActions={
                isError ? (
                  <MessageErrorActions
                    disabled={isGenerating}
                    onRetry={
                      onRegenerateMessage
                        ? () => onRegenerateMessage(message)
                        : undefined
                    }
                    onEditPrompt={
                      onEditMessage && previousUserMessage
                        ? () => onEditMessage(previousUserMessage)
                        : undefined
                    }
                    onDelete={
                      onDeleteMessage
                        ? () => onDeleteMessage(message)
                        : undefined
                    }
                  />
                ) : undefined
              }
              versionContent={content}
            />
          )}
        </div>
      </Message>
    )
  })

  if (visibleMessages.length === 0 && onSelectPrompt) {
    chatContent = [
      <PlaygroundEmptyState key='empty' onSelectPrompt={onSelectPrompt} />,
    ]
  }

  if (isLoadingMessages) {
    chatContent = [
      <div
        className='text-muted-foreground flex min-h-[min(520px,calc(100svh-18rem))] items-center justify-center gap-2 text-sm'
        key='loading'
      >
        <Loader />
        <span>{t('Loading conversation...')}</span>
      </div>,
    ]
  }

  return (
    <Conversation>
      <ConversationContent className='p-0'>
        <div
          className={cn(
            'mx-auto w-full px-4 py-4 transition-all duration-300',
            isCompare ? 'max-w-7xl' : 'max-w-4xl'
          )}
        >
          {chatContent}
        </div>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

type SingleCompareMessageBubbleProps = {
  defaultModel?: string
  isGenerating?: boolean
  message: MessageType
  messageLayoutMode: PlaygroundMessageLayoutMode
  onCopyMessage?: (message: MessageType) => void
  onDeleteMessage?: (message: MessageType) => void
  responses: NonNullable<MessageType['multiResponses']>
}

function SingleCompareMessageBubble({
  defaultModel,
  isGenerating,
  message,
  messageLayoutMode,
  onCopyMessage,
  onDeleteMessage,
  responses,
}: SingleCompareMessageBubbleProps) {
  const { t } = useTranslation()
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (
      defaultModel &&
      responses.some(
        (r) => r.model === defaultModel && (r.content || r.reasoning?.content)
      )
    ) {
      return defaultModel
    }
    const withContent = responses.find((r) => r.content || r.reasoning?.content)
    return withContent ? withContent.model : responses[0]?.model || ''
  })

  const activeResponse =
    responses.find((r) => r.model === selectedModel) || responses[0]

  if (!activeResponse) return null

  const syntheticMessage: MessageType = {
    ...message,
    versions: [{ id: '1', content: activeResponse.content }],
    reasoning: activeResponse.reasoning,
    isReasoningStreaming: activeResponse.isReasoningStreaming,
    status: activeResponse.status,
    errorCode: activeResponse.errorCode,
    sources: activeResponse.sources,
  }

  const alignment = getMessageAlignment(syntheticMessage, messageLayoutMode)

  return (
    <Message className='group flex-row-reverse py-2.5' from={message.from}>
      <div className='w-full min-w-0 flex-1 basis-full'>
        {/* Model Tabs within Single Mode Bubble */}
        <div className='flex flex-wrap items-center gap-1.5 mb-2'>
          <span className='text-[11px] font-medium text-muted-foreground mr-0.5'>
            {t('Model response')}:
          </span>
          {responses.map((r) => {
            const isSelected = r.model === selectedModel
            return (
              <button
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-mono transition-all',
                  isSelected
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                key={r.model}
                onClick={() => setSelectedModel(r.model)}
                type='button'
              >
                <BotIcon className='size-3' />
                <span>{r.model}</span>
              </button>
            )
          })}
        </div>

        <PlaygroundMessageContent
          actions={
            <MessageActions
              className='mt-1.5'
              isGenerating={isGenerating}
              message={syntheticMessage}
              onCopy={onCopyMessage}
              onDelete={onDeleteMessage}
            />
          }
          alignment={alignment}
          message={syntheticMessage}
          versionContent={activeResponse.content}
        />
      </div>
    </Message>
  )
}
