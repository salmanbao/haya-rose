"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useActionState } from "react"

import { completePasswordReset } from "@lib/data/customer"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"

type Props = {
  token: string
}

/**
 * Reset-password page (BD-AUTH-04). The reset token (from the reset email)
 * is submitted to the native update-provider route, which validates and
 * consumes it.
 */
const ResetPassword = ({ token }: Props) => {
  const [message, formAction] = useActionState(completePasswordReset, null)
  const { countryCode } = useParams() as { countryCode: string }

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="reset-password-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Choose a new password</h1>
      {message?.state === "success" ? (
        <div
          className="w-full mb-6 text-center text-base-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded p-4"
          data-testid="reset-password-success"
        >
          Your password has been updated.{" "}
          <Link
            href={`/${countryCode}/account`}
            className="underline"
            data-testid="reset-login-link"
          >
            Sign in
          </Link>{" "}
          with your new password.
        </div>
      ) : (
        <form className="w-full" action={formAction}>
          <input type="hidden" name="token" value={token} />
          <div className="flex flex-col w-full gap-y-2">
            <Input
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              data-testid="new-password-input"
            />
          </div>
          <ErrorMessage
            error={message?.state === "error" ? message.error : null}
            data-testid="reset-password-error-message"
          />
          <SubmitButton
            data-testid="reset-password-button"
            className="w-full mt-6"
          >
            Reset password
          </SubmitButton>
        </form>
      )}
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        <Link
          href={`/${countryCode}/account`}
          className="underline"
          data-testid="back-to-login-link"
        >
          Back to sign in
        </Link>
      </span>
    </div>
  )
}

export default ResetPassword