import { z } from 'zod'
import { emailSchema } from './common'
import { PASSWORD_MAX, passwordProblem } from './password'

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(120),
    email: emailSchema,
    password: z.string().max(PASSWORD_MAX),
    acceptTerms: z.literal('on', { message: 'Please accept the terms to continue.' }),
  })
  .superRefine((v, ctx) => {
    const problem = passwordProblem(v.password, v.email)
    if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem })
  })

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX),
})

export const forgotPasswordSchema = z.object({ email: emailSchema })

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(100),
    password: z.string().max(PASSWORD_MAX),
  })
  .superRefine((v, ctx) => {
    const problem = passwordProblem(v.password)
    if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem })
  })

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX),
    newPassword: z.string().max(PASSWORD_MAX),
  })
  .superRefine((v, ctx) => {
    const problem = passwordProblem(v.newPassword)
    if (problem) ctx.addIssue({ code: 'custom', path: ['newPassword'], message: problem })
  })
