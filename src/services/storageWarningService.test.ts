import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postStaffDeviceWarning } from '@/api/staffWarningsApi';
import { showToast } from '@/components/toast';
import { warnIfLowStorage } from '@/services/storageWarningService';

vi.mock('@/components/toast', () => ({
  showToast: vi.fn(),
}));

vi.mock('@/api/staffWarningsApi', () => ({
  postStaffDeviceWarning: vi.fn(async () => {}),
}));

describe('warnIfLowStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the softer warning once per page load', async () => {
    vi.stubGlobal('navigator', {
      onLine: true,
      storage: {
        estimate: async () => ({ quota: 400 * 1024 * 1024, usage: 0 }),
      },
    });

    await warnIfLowStorage();
    await warnIfLowStorage();

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(postStaffDeviceWarning).toHaveBeenCalledTimes(1);
    expect(postStaffDeviceWarning).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warning', threshold_mb: 500 }),
    );
  });
});
