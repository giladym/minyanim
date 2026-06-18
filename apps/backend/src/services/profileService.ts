import type { Profile, UpdateProfileInput } from "@minyanim/shared";
import type { Db } from "../db/client";
import { findUser, updateUser, listPhones } from "../repositories/userRepository";

/** Business logic for the user profile (framework-agnostic). */
export async function getProfile(db: Db, userId: string): Promise<Profile | null> {
  const u = await findUser(db, userId);
  if (!u) return null;
  const phones = await listPhones(db, userId);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    language: u.language,
    theme: u.theme,
    phones: phones.map((p) => ({ id: p.id, e164: p.e164, label: p.label })),
  };
}

export async function updateProfile(db: Db, userId: string, input: UpdateProfileInput) {
  await updateUser(db, userId, input);
  return getProfile(db, userId);
}
