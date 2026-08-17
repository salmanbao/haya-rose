import Link from "next/link"
import { useParams } from "next/navigation"
import { login } from "@lib/data/customer"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { useActionState } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
  googleEnabled?: boolean
}

const Login = ({ setCurrentView, googleEnabled = false }: Props) => {
  const [message, formAction] = useActionState(login, null)
  const { countryCode } = useParams() as { countryCode: string }

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="login-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Welcome back</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Sign in to access an enhanced shopping experience.
      </p>
      {message?.state === "verification_required" && (
        <div
          className="w-full mb-6 text-center text-base-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded p-4"
          data-testid="login-verification-message"
        >
          We sent a verification link to <strong>{message.email}</strong>.
          Please verify your email, then sign in.
        </div>
      )}
      {googleEnabled && (
        <>
          <Link
            href="/api/auth/google"
            className="w-full text-center text-base-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded py-3 mb-4 hover:bg-ui-bg-base-hover"
            data-testid="google-sign-in-button"
          >
            Continue with Google
          </Link>
          <div className="w-full flex items-center gap-x-4 mb-4">
            <span className="flex-1 border-t border-ui-border-base" />
            <span className="text-small-regular text-ui-fg-subtle">
              or sign in with email
            </span>
            <span className="flex-1 border-t border-ui-border-base" />
          </div>
        </>
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
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
        </div>
        <div className="flex justify-end mt-2">
          <Link
            href={`/${countryCode}/forgot-password`}
            className="text-small-regular text-ui-fg-subtle underline"
            data-testid="forgot-password-link"
          >
            Forgot your password?
          </Link>
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="login-error-message"
        />
        <SubmitButton data-testid="sign-in-button" className="w-full mt-6">
          Sign in
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Not a member?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="underline"
          data-testid="register-button"
        >
          Join us
        </button>
        .
      </span>
    </div>
  )
}

export default Login