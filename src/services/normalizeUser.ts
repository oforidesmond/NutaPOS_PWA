import type { LoginResponseDto, StaffUserDto } from '@/types/session';
import type { UserProfile } from '@/services/userProfileStore';

export function normalizeUser(dto: LoginResponseDto): UserProfile {
  const u: StaffUserDto = dto.user;
  const sp = dto.staffProfile ?? dto.staff_profile;
  const needsPasswordChange = Boolean(
    u.isTemporaryPassword || u.is_temporary_password || u.needsPasswordChange || u.needs_password_change,
  );
  return {
    userId: u.id,
    staffId: sp?.staffId ?? '',
    branchId: sp?.branchId ?? null,
    organizationId: u.organizationId ?? u.organization_id ?? null,
    needsPasswordChange,
  };
}
