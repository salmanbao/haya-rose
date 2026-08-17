"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useActionState } from "react"

import { requestPasswordReset } from "@lib/data/customer"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"

/**
 * Forgot-password page (BD-AUTH-04). The backend answers 201 for existing AND
 * unknown identifiers, so the success message is identical either way — no
 * identity leak.
 */
const ForgotPassword = () => {
  const [message, formAction] = useActionState(requestPasswordReset, null)
  const { countryCode } = useParams() as { countryCode: string }

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="forgot-password-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Forgot your password?</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Enter your email and we&apos;ll send you a link to reset your
        password.
      </p>
      {message?.state === "success" && (
        <div
          className="w-full mb-6 text-center text-base-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded p-4"
          data-testid="forgot-password-success"
        >
          If an account exists for that email, a password reset link is on
          its way. Check your inbox.
        </div>
      )}
      <form className="w-full" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Email"
            name="email"
            type="email"
            title="Enter a valid email address."
            autoComplete="email"
            required
            data-testid="email-input"
          />
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="forgot-password-error-message"
        />
        <SubmitButton
          data-testid="request-reset-button"
          className="w-full mt-6"
        >
          Send reset link
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Remembered your password?{" "}
        <Link
          href={`/${countryCode}/account`}
          className="underline"
          data-testid="back-to-login-link"
        >
          Back to sign in
        </Link>
        .
      </span>
    </div>
  )
}

export default ForgotPassword