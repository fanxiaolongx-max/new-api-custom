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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SSE } from 'sse.js'

import { getFreshAuthHeaders } from '@/lib/api'
import { sendChatCompletion } from '../api'
import { API_ENDPOINTS, ERROR_MESSAGES, MESSAGE_STATUS } from '../constants'
import {
  applyStreamingChunk,
  buildChatCompletionPayload,
  updateAssistantMessageWithError,
  updateLastAssistantMessage,
  parseRequestErrorDetails,
  applyChatCompletionResponse,
  completeAssistantMessage,
  hasChatCompletionChoice,
  isAssistantMessageFinal,
  isAssistantMessagePending,
  isStreamClosedReadyState,
  isStreamDoneMessage,
  parseStreamErrorDetails,
  parseStreamMessageUpdates,
} from '../lib'
import type { Message, PlaygroundConfig, ParameterEnabled } from '../types'
import { useStreamRequest } from './use-stream-request'

interface UseChatHandlerOptions {
  config: PlaygroundConfig
  parameterEnabled: ParameterEnabled
  onMessageUpdate: (updater: (prev: Message[]) => Message[]) => void
}

const KNOWN_ERROR_MESSAGES = new Set<string>(Object.values(ERROR_MESSAGES))
const STREAM_UPDATE_FLUSH_MS = 50

type PendingStreamChunks = {
  generation: number
  content: string
  reasoning: string
}

function mergePendingStreamChunk(
  currentChunk: string,
  nextChunk: string
): string {
  if (!currentChunk || !nextChunk.startsWith(currentChunk)) {
    return currentChunk + nextChunk
  }

  return nextChunk
}

/**
 * Hook for handling chat message sending and receiving
 */
export function useChatHandler({
  config,
  parameterEnabled,
  onMessageUpdate,
}: UseChatHandlerOptions) {
  const { t } = useTranslation()
  const { sendStreamRequest, stopStream, isStreaming } = useStreamRequest()
  const [isRequesting, setIsRequesting] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const compareSourcesRef = useRef<Array<{ close: () => void }>>([])
  const requestGenerationRef = useRef(0)
  const pendingStreamChunksRef = useRef<PendingStreamChunks>({
    generation: 0,
    content: '',
    reasoning: '',
  })
  const streamFlushTimerRef = useRef<number | null>(null)

  const discardPendingStreamUpdates = useCallback((generation: number) => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current)
      streamFlushTimerRef.current = null
    }
    pendingStreamChunksRef.current = {
      generation,
      content: '',
      reasoning: '',
    }
  }, [])

  const flushStreamUpdates = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current)
        streamFlushTimerRef.current = null
      }

      const pendingChunks = pendingStreamChunksRef.current
      if (pendingChunks.generation !== generation) return
      if (!pendingChunks.reasoning && !pendingChunks.content) {
        return
      }

      pendingStreamChunksRef.current = {
        generation,
        content: '',
        reasoning: '',
      }
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateLastAssistantMessage(prev, (message) => {
          let updatedMessage = message

          if (pendingChunks.reasoning) {
            updatedMessage = applyStreamingChunk(
              updatedMessage,
              'reasoning',
              pendingChunks.reasoning
            )
          }

          if (pendingChunks.content) {
            updatedMessage = applyStreamingChunk(
              updatedMessage,
              'content',
              pendingChunks.content
            )
          }

          return updatedMessage
        })
      })
    },
    [onMessageUpdate]
  )

  const scheduleStreamFlush = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      if (streamFlushTimerRef.current !== null) {
        return
      }

      streamFlushTimerRef.current = window.setTimeout(() => {
        flushStreamUpdates(generation)
      }, STREAM_UPDATE_FLUSH_MS)
    },
    [flushStreamUpdates]
  )

  useEffect(
    () => () => {
      requestGenerationRef.current += 1
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current)
      }
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
    },
    []
  )

  const getDisplayError = useCallback(
    (error: string) => {
      if (KNOWN_ERROR_MESSAGES.has(error)) {
        return t(error)
      }

      const connectionClosedSuffix = `: ${ERROR_MESSAGES.CONNECTION_CLOSED}`
      if (error.endsWith(connectionClosedSuffix)) {
        return `${error.slice(0, -ERROR_MESSAGES.CONNECTION_CLOSED.length)}${t(
          ERROR_MESSAGES.CONNECTION_CLOSED
        )}`
      }

      return error
    },
    [t]
  )

  // Handle stream update
  const handleStreamUpdate = useCallback(
    (generation: number, type: 'reasoning' | 'content', chunk: string) => {
      if (generation !== requestGenerationRef.current) return
      if (pendingStreamChunksRef.current.generation !== generation) return
      pendingStreamChunksRef.current[type] = mergePendingStreamChunk(
        pendingStreamChunksRef.current[type],
        chunk
      )
      scheduleStreamFlush(generation)
    },
    [scheduleStreamFlush]
  )

  // Handle stream complete
  const handleStreamComplete = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      flushStreamUpdates(generation)
      setIsRequesting(false)
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateLastAssistantMessage(prev, (message) =>
          isAssistantMessageFinal(message)
            ? message
            : completeAssistantMessage(message)
        )
      })
    },
    [flushStreamUpdates, onMessageUpdate]
  )

  // Handle stream error
  const handleStreamError = useCallback(
    (generation: number, error: string, errorCode?: string) => {
      if (generation !== requestGenerationRef.current) return
      flushStreamUpdates(generation)
      setIsRequesting(false)
      const displayError = getDisplayError(error)
      toast.error(displayError)
      const errorTitle = t(ERROR_MESSAGES.API_REQUEST_ERROR)
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateAssistantMessageWithError(
          prev,
          displayError,
          errorCode,
          errorTitle
        )
      })
    },
    [flushStreamUpdates, getDisplayError, onMessageUpdate, t]
  )

  // Send multi-model streaming chat request
  const sendMultiModelStreamingChat = useCallback(
    async (messages: Message[]) => {
      const lastMsg = messages[messages.length - 1]
      const multiResponses = lastMsg?.multiResponses || []
      if (multiResponses.length === 0) return

      const generation = requestGenerationRef.current + 1
      requestGenerationRef.current = generation
      stopStream()
      compareSourcesRef.current.forEach((src) => src.close())
      compareSourcesRef.current = []
      discardPendingStreamUpdates(generation)
      setIsRequesting(true)

      let authHeaders: Record<string, string> = {}
      try {
        authHeaders = await getFreshAuthHeaders()
      } catch {
        toast.error(t('Failed to get authentication headers'))
        setIsRequesting(false)
        return
      }

      let activeStreamsCount = multiResponses.length
      const startTime = Date.now()

      multiResponses.forEach((item) => {
        const modelName = item.model
        const modelConfig = { ...config, model: modelName }
        const payload = buildChatCompletionPayload(
          messages,
          modelConfig,
          parameterEnabled
        )

        try {
          const sse = new SSE(API_ENDPOINTS.CHAT_COMPLETIONS, {
            headers: authHeaders,
            payload: JSON.stringify(payload),
            method: 'POST',
          })

          compareSourcesRef.current.push(sse)

          let accumulatedReasoning = ''
          let accumulatedContent = ''

          sse.addEventListener('message', (event: any) => {
            if (generation !== requestGenerationRef.current) {
              sse.close()
              return
            }

            const data = event.data
            if (!data || isStreamDoneMessage(data)) {
              return
            }

            try {
              const updates = parseStreamMessageUpdates(data)
              let hasChange = false
              updates.forEach((u) => {
                if (u.type === 'reasoning') {
                  accumulatedReasoning += u.chunk
                  hasChange = true
                } else if (u.type === 'content') {
                  accumulatedContent += u.chunk
                  hasChange = true
                }
              })

              if (hasChange) {
                onMessageUpdate((prev) => {
                  if (generation !== requestGenerationRef.current) return prev
                  return updateLastAssistantMessage(prev, (msg) => {
                    if (!msg.multiResponses) return msg
                    const nextMulti = msg.multiResponses.map((r) => {
                      if (r.model !== modelName) return r
                      return {
                        ...r,
                        content: accumulatedContent,
                        reasoning: accumulatedReasoning
                          ? {
                              content: accumulatedReasoning,
                              duration: r.reasoning?.duration || 0,
                            }
                          : undefined,
                        status: MESSAGE_STATUS.STREAMING,
                        isReasoningStreaming: Boolean(
                          accumulatedReasoning && !accumulatedContent
                        ),
                      }
                    })
                    return { ...msg, multiResponses: nextMulti }
                  })
                })
              }
            } catch {
              // ignore parse errors
            }
          })

          const handleFinish = (
            status: 'complete' | 'error',
            errText?: string
          ) => {
            sse.close()
            activeStreamsCount -= 1
            const durationMs = Date.now() - startTime

            onMessageUpdate((prev) => {
              if (generation !== requestGenerationRef.current) return prev
              return updateLastAssistantMessage(prev, (msg) => {
                if (!msg.multiResponses) return msg
                const nextMulti = msg.multiResponses.map((r) => {
                  if (r.model !== modelName) return r
                  return {
                    ...r,
                    status:
                      status === 'complete'
                        ? MESSAGE_STATUS.COMPLETE
                        : MESSAGE_STATUS.ERROR,
                    errorCode: errText || null,
                    durationMs,
                    completedAt: Date.now(),
                  }
                })
                const allFinished = nextMulti.every(
                  (r) =>
                    r.status === MESSAGE_STATUS.COMPLETE ||
                    r.status === MESSAGE_STATUS.ERROR
                )
                return {
                  ...msg,
                  status: allFinished
                    ? MESSAGE_STATUS.COMPLETE
                    : MESSAGE_STATUS.STREAMING,
                  multiResponses: nextMulti,
                }
              })
            })

            if (activeStreamsCount <= 0) {
              setIsRequesting(false)
            }
          }

          sse.addEventListener('readystatechange', (event: any) => {
            if (isStreamClosedReadyState(event.readyState)) {
              handleFinish('complete')
            }
          })

          sse.addEventListener('error', (event: any) => {
            const errDetails = parseStreamErrorDetails(event.data)
            handleFinish('error', errDetails.errorMessage)
          })

          sse.stream()
        } catch {
          activeStreamsCount -= 1
          if (activeStreamsCount <= 0) {
            setIsRequesting(false)
          }
        }
      })
    },
    [
      config,
      parameterEnabled,
      stopStream,
      discardPendingStreamUpdates,
      onMessageUpdate,
      t,
    ]
  )

  // Send streaming chat request
  const sendStreamingChat = useCallback(
    (messages: Message[]) => {
      const generation = requestGenerationRef.current + 1
      requestGenerationRef.current = generation
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      discardPendingStreamUpdates(generation)
      setIsRequesting(true)
      const payload = buildChatCompletionPayload(
        messages,
        config,
        parameterEnabled
      )
      void sendStreamRequest(
        payload,
        (type, chunk) => handleStreamUpdate(generation, type, chunk),
        () => handleStreamComplete(generation),
        (error, errorCode) => handleStreamError(generation, error, errorCode)
      )
    },
    [
      config,
      parameterEnabled,
      sendStreamRequest,
      discardPendingStreamUpdates,
      handleStreamUpdate,
      handleStreamComplete,
      handleStreamError,
    ]
  )

  // Send non-streaming chat request
  const sendNonStreamingChat = useCallback(
    async (messages: Message[]) => {
      const payload = buildChatCompletionPayload(
        messages,
        config,
        parameterEnabled
      )
      const generation = requestGenerationRef.current + 1
      const abortController = new AbortController()

      requestGenerationRef.current = generation
      stopStream()
      discardPendingStreamUpdates(generation)
      abortControllerRef.current?.abort()
      abortControllerRef.current = abortController

      try {
        setIsRequesting(true)
        const response = await sendChatCompletion(
          payload,
          abortController.signal
        )
        if (
          abortController.signal.aborted ||
          requestGenerationRef.current !== generation
        ) {
          return
        }

        if (!hasChatCompletionChoice(response)) {
          handleStreamError(generation, ERROR_MESSAGES.API_REQUEST_ERROR)
          return
        }

        onMessageUpdate((prev) => {
          if (requestGenerationRef.current !== generation) return prev
          return updateLastAssistantMessage(prev, (message) => {
            const updatedMessage = applyChatCompletionResponse(
              message,
              response
            )

            return updatedMessage ?? message
          })
        })
      } catch (error: unknown) {
        if (
          abortController.signal.aborted ||
          requestGenerationRef.current !== generation
        ) {
          return
        }

        const { errorCode, errorMessage } = parseRequestErrorDetails(error)
        handleStreamError(generation, errorMessage, errorCode)
      } finally {
        if (requestGenerationRef.current === generation) {
          abortControllerRef.current = null
          setIsRequesting(false)
        }
      }
    },
    [
      config,
      parameterEnabled,
      stopStream,
      discardPendingStreamUpdates,
      onMessageUpdate,
      handleStreamError,
    ]
  )

  // Send chat request (stream or non-stream based on config)
  const sendChat = useCallback(
    (messages: Message[]) => {
      const lastMessage = messages[messages.length - 1]
      if (
        lastMessage?.multiResponses &&
        lastMessage.multiResponses.length > 0
      ) {
        void sendMultiModelStreamingChat(messages)
        return
      }

      if (config.stream) {
        sendStreamingChat(messages)
      } else {
        sendNonStreamingChat(messages)
      }
    },
    [
      config.stream,
      sendStreamingChat,
      sendNonStreamingChat,
      sendMultiModelStreamingChat,
    ]
  )

  // Stop generation
  const stopGeneration = useCallback(() => {
    const stoppedGeneration = requestGenerationRef.current
    flushStreamUpdates(stoppedGeneration)
    const idleGeneration = stoppedGeneration + 1
    requestGenerationRef.current = idleGeneration
    discardPendingStreamUpdates(idleGeneration)
    stopStream()
    compareSourcesRef.current.forEach((src) => src.close())
    compareSourcesRef.current = []
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsRequesting(false)
    onMessageUpdate((prev) => {
      if (requestGenerationRef.current !== idleGeneration) return prev
      return updateLastAssistantMessage(prev, (message) =>
        isAssistantMessagePending(message)
          ? completeAssistantMessage(message)
          : message
      )
    })
  }, [
    stopStream,
    flushStreamUpdates,
    discardPendingStreamUpdates,
    onMessageUpdate,
  ])

  return {
    sendChat,
    stopGeneration,
    isGenerating: isStreaming || isRequesting,
  }
}
