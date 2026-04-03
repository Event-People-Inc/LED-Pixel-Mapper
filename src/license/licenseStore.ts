import { create } from 'zustand';

export type LicenseStatus = 'free' | 'pro' | 'overdue' | 'invalid';

interface LicenseStore {
  status: LicenseStatus;
  isPro: boolean;
  isOverdue: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  activate: (key: string) => Promise<{ success: boolean; message: string }>;
  check: () => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = () => (window as any).electronAPI?.license;

export const useLicenseStore = create<LicenseStore>((set) => ({
  status:      'free',
  isPro:       false,
  isOverdue:   false,
  initialized: false,

  initialize: async () => {
    if (!api()) { set({ initialized: true }); return; }
    // Call check() (not getStatus()) so we wait for periodicCheck to fully
    // resolve — including any Gumroad API call for overdue licenses.
    const status = (await api().check()) as LicenseStatus;
    set({
      status,
      isPro:       status === 'pro' || status === 'overdue',
      isOverdue:   status === 'overdue',
      initialized: true,
    });
  },

  activate: async (key: string) => {
    if (!api()) return { success: false, message: 'Not in Electron environment.' };
    const result = await api().activate(key);
    if (result.success) {
      set({ status: 'pro', isPro: true, isOverdue: false });
    }
    return result;
  },

  check: async () => {
    if (!api()) return;
    const status = (await api().check()) as LicenseStatus;
    set({
      status,
      isPro:     status === 'pro' || status === 'overdue',
      isOverdue: status === 'overdue',
    });
  },
}));
