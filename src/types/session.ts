export type StaffProfileDto = {
  staffId: string;
  branchId?: string | null;
  id?: string;
};

export type StaffUserDto = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  isTemporaryPassword?: boolean;
  is_temporary_password?: boolean;
  needsPasswordChange?: boolean;
  needs_password_change?: boolean;
  organizationId?: string;
  organization_id?: string;
};

export type LoginResponseDto = {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  user: StaffUserDto;
  staffProfile?: StaffProfileDto;
  staff_profile?: StaffProfileDto;
};
