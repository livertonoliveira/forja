import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock lucide-react icons to avoid ESM/JSX issues in node env
vi.mock('lucide-react', () => ({
  CheckCircle: 'CheckCircle',
  XCircle: 'XCircle',
  AlertTriangle: 'AlertTriangle',
  Info: 'Info',
}))

// Mock React.createElement so icon creation doesn't fail
vi.mock('react', () => ({
  default: {
    createElement: vi.fn((type, props) => ({ type, props })),
  },
  createElement: vi.fn((type, props) => ({ type, props })),
}))

// Mock sonner — must be defined before importing toast
const mockSonnerToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  promise: vi.fn(),
}

vi.mock('sonner', () => ({
  toast: mockSonnerToast,
}))

// Import after mocks are set up
const { toast } = await import('./toast')

describe('toast wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── success ──────────────────────────────────────────────────────────────

  describe('toast.success', () => {
    it('calls sonnerToast.success with className forja-toast forja-toast--success', () => {
      toast.success('Done!')
      expect(mockSonnerToast.success).toHaveBeenCalledOnce()
      const [, opts] = mockSonnerToast.success.mock.calls[0]
      expect(opts.className).toBe('forja-toast forja-toast--success')
    })

    it('uses default duration of 4000', () => {
      toast.success('Done!')
      const [, opts] = mockSonnerToast.success.mock.calls[0]
      expect(opts.duration).toBe(4000)
    })

    it('forwards the message as first argument', () => {
      toast.success('Task complete')
      const [msg] = mockSonnerToast.success.mock.calls[0]
      expect(msg).toBe('Task complete')
    })

    it('passes action to sonnerToast when provided', () => {
      const onClick = vi.fn()
      toast.success('Done!', { action: { label: 'Undo', onClick } })
      const [, opts] = mockSonnerToast.success.mock.calls[0]
      expect(opts.action).toEqual({ label: 'Undo', onClick })
    })
  })

  // ─── error ────────────────────────────────────────────────────────────────

  describe('toast.error', () => {
    it('calls sonnerToast.error with className forja-toast forja-toast--error', () => {
      toast.error('Oops!')
      expect(mockSonnerToast.error).toHaveBeenCalledOnce()
      const [, opts] = mockSonnerToast.error.mock.calls[0]
      expect(opts.className).toBe('forja-toast forja-toast--error')
    })

    it('uses default duration of 8000', () => {
      toast.error('Oops!')
      const [, opts] = mockSonnerToast.error.mock.calls[0]
      expect(opts.duration).toBe(8000)
    })

    it('overrides default duration when custom duration is provided', () => {
      toast.error('Oops!', { duration: 3000 })
      const [, opts] = mockSonnerToast.error.mock.calls[0]
      expect(opts.duration).toBe(3000)
    })
  })

  // ─── warning ──────────────────────────────────────────────────────────────

  describe('toast.warning', () => {
    it('calls sonnerToast.warning with className forja-toast forja-toast--warning', () => {
      toast.warning('Be careful!')
      expect(mockSonnerToast.warning).toHaveBeenCalledOnce()
      const [, opts] = mockSonnerToast.warning.mock.calls[0]
      expect(opts.className).toBe('forja-toast forja-toast--warning')
    })

    it('uses default duration of 4000', () => {
      toast.warning('Be careful!')
      const [, opts] = mockSonnerToast.warning.mock.calls[0]
      expect(opts.duration).toBe(4000)
    })
  })

  // ─── info ─────────────────────────────────────────────────────────────────

  describe('toast.info', () => {
    it('calls sonnerToast.info with className forja-toast forja-toast--info', () => {
      toast.info('FYI')
      expect(mockSonnerToast.info).toHaveBeenCalledOnce()
      const [, opts] = mockSonnerToast.info.mock.calls[0]
      expect(opts.className).toBe('forja-toast forja-toast--info')
    })

    it('uses default duration of 4000', () => {
      toast.info('FYI')
      const [, opts] = mockSonnerToast.info.mock.calls[0]
      expect(opts.duration).toBe(4000)
    })
  })

  // ─── promise ──────────────────────────────────────────────────────────────

  describe('toast.promise', () => {
    it('calls sonnerToast.promise with the promise', () => {
      const p = Promise.resolve('ok')
      toast.promise(p, { loading: 'Loading…', success: 'Done', error: 'Fail' })
      expect(mockSonnerToast.promise).toHaveBeenCalledOnce()
      const [passedPromise] = mockSonnerToast.promise.mock.calls[0]
      expect(passedPromise).toBe(p)
    })

    it('returns the original promise', () => {
      const p = Promise.resolve('result')
      const returned = toast.promise(p, { loading: 'Loading…', success: 'Done', error: 'Fail' })
      expect(returned).toBe(p)
    })
  })
})
