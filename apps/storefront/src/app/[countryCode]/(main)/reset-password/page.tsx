import { Metadata } from "next"

import ResetPassword from "@modules/account/components/reset-password"

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new password.",
}

type Props = {
  searchParams: Promise<{ token?: string }>
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) {
    return (
      <p className="text-center text-base-regular text-ui-fg-base">
        This password reset link is invalid or incomplete.
      </p>
    )
  }

  return <ResetPassword token={token} />
}