import { Metadata } from "next"

import ForgotPassword from "@modules/account/components/forgot-password"

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Request a password reset link.",
}

export default function ForgotPasswordPage() {
  return <ForgotPassword />
}