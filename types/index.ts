export type UserProfile = {
  id: string;
  displayName: string;
  avatarUrl: string;
  createdAt: string;
};

export type Space = {
  id: string;
  name: string;
  createdAt: string;
  ownerProfileId: string;
  coAdminProfileIds: string[];
  inviteToken: string;
};
