import { z } from "zod";

// Auth payload contracts (shared FE/BE). Error strings are CODES (frontend localizes).
export const emailSchema = z.string().email("email.invalid");
export const passwordSchema = z.string().min(8, "password.too_short").max(128);

export const signUpSchema = z.object({
  name: z.string().min(1, "name.required").max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "password.required"),
  sharedDevice: z.boolean().optional(),
});

export const requestResetSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RequestResetInput = z.infer<typeof requestResetSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
