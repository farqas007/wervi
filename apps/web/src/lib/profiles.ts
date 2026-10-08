import {
  categoryListResponseSchema,
  categorySchema,
  myProfileResponseSchema,
  profileLanguageListResponseSchema,
  profileSkillListResponseSchema,
  publicProfileResponseSchema,
  skillListResponseSchema,
  type Category,
  type CategoryListResponse,
  type MyProfileResponse,
  type ProfileLanguageListResponse,
  type ProfileSkillListResponse,
  type PublicProfileResponse,
  type ReplaceLanguagesRequest,
  type ReplaceSkillsRequest,
  type SkillListResponse,
  type UpdateProfileRequest,
} from '@wervi/shared';
import { apiRequest, type ApiError } from './api';

export type { ApiError };

export async function fetchMyProfile(): Promise<MyProfileResponse> {
  return apiRequest('/profiles/me', myProfileResponseSchema, {
    credentials: 'include',
  });
}

export async function updateMyProfile(
  body: UpdateProfileRequest,
): Promise<MyProfileResponse> {
  return apiRequest('/profiles/me', myProfileResponseSchema, {
    method: 'PATCH',
    body,
    credentials: 'include',
  });
}

export async function fetchMySkills(): Promise<ProfileSkillListResponse> {
  return apiRequest('/profiles/me/skills', profileSkillListResponseSchema, {
    credentials: 'include',
  });
}

export async function replaceMySkills(
  body: ReplaceSkillsRequest,
): Promise<ProfileSkillListResponse> {
  return apiRequest('/profiles/me/skills', profileSkillListResponseSchema, {
    method: 'PUT',
    body,
    credentials: 'include',
  });
}

export async function fetchMyLanguages(): Promise<ProfileLanguageListResponse> {
  return apiRequest(
    '/profiles/me/languages',
    profileLanguageListResponseSchema,
    {
      credentials: 'include',
    },
  );
}

export async function replaceMyLanguages(
  body: ReplaceLanguagesRequest,
): Promise<ProfileLanguageListResponse> {
  return apiRequest(
    '/profiles/me/languages',
    profileLanguageListResponseSchema,
    {
      method: 'PUT',
      body,
      credentials: 'include',
    },
  );
}

export async function fetchPublicProfile(
  userId: string,
): Promise<PublicProfileResponse> {
  return apiRequest(`/profiles/${userId}`, publicProfileResponseSchema);
}

export async function fetchCategories(): Promise<CategoryListResponse> {
  return apiRequest('/categories', categoryListResponseSchema);
}

export async function fetchCategory(id: string): Promise<{ item: Category }> {
  return apiRequest(
    `/categories/${id}`,
    categorySchema
      .extend({})
      .strict()
      .transform((item) => ({ item })),
  );
}

export async function fetchSkills(
  categoryId?: string,
): Promise<SkillListResponse> {
  return apiRequest('/skills', skillListResponseSchema, {
    query: categoryId === undefined ? {} : { categoryId },
  });
}
