import { toast as sonnerToast } from 'sonner'
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import React from 'react'

export interface ToastOptions {
  duration?: number
  action?: { label: string; onClick: () => void }
  description?: string
  id?: string | number
}

export interface PromiseToastOpts<T> {
  loading: string
  success: string | ((data: T) => string)
  error: string | ((err: unknown) => string)
}

export const toast = {
  success(message: string, opts?: ToastOptions) {
    return sonnerToast.success(message, {
      duration: opts?.duration ?? 4000,
      description: opts?.description,
      id: opts?.id,
      action: opts?.action
        ? { label: opts.action.label, onClick: opts.action.onClick }
        : undefined,
      className: 'forja-toast forja-toast--success',
      icon: React.createElement(CheckCircle, { size: 16, color: '#86EFAC' }),
    })
  },

  error(message: string, opts?: ToastOptions) {
    return sonnerToast.error(message, {
      duration: opts?.duration ?? 8000,
      description: opts?.description,
      id: opts?.id,
      action: opts?.action
        ? { label: opts.action.label, onClick: opts.action.onClick }
        : undefined,
      className: 'forja-toast forja-toast--error',
      icon: React.createElement(XCircle, { size: 16, color: '#FCA5A5' }),
    })
  },

  warning(message: string, opts?: ToastOptions) {
    return sonnerToast.warning(message, {
      duration: opts?.duration ?? 4000,
      description: opts?.description,
      id: opts?.id,
      action: opts?.action
        ? { label: opts.action.label, onClick: opts.action.onClick }
        : undefined,
      className: 'forja-toast forja-toast--warning',
      icon: React.createElement(AlertTriangle, { size: 16, color: '#FCD34D' }),
    })
  },

  info(message: string, opts?: ToastOptions) {
    return sonnerToast.info(message, {
      duration: opts?.duration ?? 4000,
      description: opts?.description,
      id: opts?.id,
      action: opts?.action
        ? { label: opts.action.label, onClick: opts.action.onClick }
        : undefined,
      className: 'forja-toast forja-toast--info',
      icon: React.createElement(Info, { size: 16, color: '#C9A84C' }),
    })
  },

  promise<T>(promise: Promise<T>, opts: PromiseToastOpts<T>): Promise<T> {
    sonnerToast.promise(promise, {
      loading: opts.loading,
      success: opts.success,
      error: opts.error,
      className: 'forja-toast',
    })
    return promise
  },
}
