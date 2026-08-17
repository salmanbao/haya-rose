import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  StatusBadge,
  Switch,
  Text,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"

import {
  type ProviderField,
  getProviderRegistryEntry,
} from "../../../../modules/payment-config/registry"

/**
 * Admin-managed payment provider configuration (approved architecture
 * 2026-08-17). Provider credentials are entered here, encrypted at rest in
 * PostgreSQL (AES-256-GCM, master key in the backend environment), and are
 * NEVER returned by the API — the list endpoint returns masked views
 * (secret field NAMES only). Blank secret fields on save retain the stored
 * value; typing a value rotates it.
 */

type AdminProviderConfigView = {
  provider: "safepay" | "stripe"
  display_name: string
  enabled: boolean
  environment: string
  market: { name: string; currency: string }
  provider_key: string
  webhook_path: string
  config: Record<string, unknown>
  secrets_configured: string[]
  has_webhook_secret: boolean
  configured: boolean
  registered: boolean
  last_tested_at: string | null
  last_test_status: "ok" | "failed" | null
  last_test_error: string | null
  created_at: string | null
  updated_at: string | null
}

type ListResponse = { payment_providers: AdminProviderConfigView[] }

/**
 * Field metadata (labels, descriptions, examples, options) comes from the
 * payment-config provider registry — the Admin page and the Admin API share
 * the same source of truth for what can be configured.
 */
function fieldPlaceholder(field: ProviderField): string {
  if (field.example) {
    return `e.g. ${field.example}`
  }
  if (field.options) {
    return "Select an option"
  }
  return field.placeholder ?? `Enter ${field.label}`
}

function FieldDescription({ field }: { field: ProviderField }) {
  if (!field.description) {
    return null
  }
  return (
    <Text className="text-ui-fg-muted">{field.description}</Text>
  )
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string
    }
    throw new Error(body.message ?? `Request failed (HTTP ${response.status})`)
  }
  return response.json() as Promise<T>
}

type FormState = {
  enabled: boolean
  environment: string
  publicValues: Record<string, string | boolean>
  secretValues: Record<string, string>
}

const initialForm = (view?: AdminProviderConfigView): FormState => ({
  enabled: view?.enabled ?? false,
  environment: view?.environment ?? "sandbox",
  publicValues: Object.fromEntries(
    Object.entries(view?.config ?? {}).map(([key, value]) => [
      key,
      typeof value === "string" ? value : Boolean(value),
    ])
  ),
  secretValues: {},
})

function ProviderCard({
  view,
  onSaved,
  onError,
}: {
  view: AdminProviderConfigView
  onSaved: () => void
  onError: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => initialForm(view))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    status: string
    error?: string
  } | null>(null)

  const registry = getProviderRegistryEntry(view.provider)
  const market = registry?.market
  const environments = registry?.environments ?? []
  const publicFields = registry?.configFields ?? []
  const secretFields = registry?.secretFields ?? []

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: {
        enabled: boolean
        environment: string
        config: Record<string, unknown>
        secrets: Record<string, string>
      } = {
        enabled: form.enabled,
        environment: form.environment,
        config: {},
        secrets: {},
      }
      for (const [key, value] of Object.entries(form.publicValues)) {
        if (typeof value === "string" && value.length > 0) {
          body.config[key] = value
        } else if (typeof value === "boolean") {
          body.config[key] = value
        }
      }
      // Blank secrets are omitted → the backend retains the stored value.
      for (const [key, value] of Object.entries(form.secretValues)) {
        if (value.length > 0) {
          body.secrets[key] = value
        }
      }
      return fetchJson<{ payment_provider: AdminProviderConfigView }>(
        `/admin/payment-provider-config/${view.provider}`,
        { method: "POST", body: JSON.stringify(body) }
      )
    },
    onSuccess: async (data) => {
      setForm(initialForm(data.payment_provider))
      setTestResult(null)
      await queryClient.invalidateQueries({ queryKey: ["payment-provider-config"] })
      onSaved()
    },
    onError: (error: Error) => onError(error.message),
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      setTestResult(null)
      return fetchJson<{ status: string; error?: string }>(
        `/admin/payment-provider-config/${view.provider}/test-connection`,
        { method: "POST", body: "{}" }
      )
    },
    onSuccess: (data) => {
      setTestResult(data)
      void queryClient.invalidateQueries({
        queryKey: ["payment-provider-config"],
      })
    },
    onError: (error: Error) => {
      setTestResult({ status: "failed", error: error.message })
    },
  })

  const onSave = () => {
    setSaving(true)
    void saveMutation.mutateAsync().finally(() => setSaving(false))
  }

  const onTest = () => {
    setTesting(true)
    void testMutation.mutateAsync().finally(() => setTesting(false))
  }

  return (
    <Container className="flex flex-col gap-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-y-1">
          <Heading level="h2">{view.display_name}</Heading>
          <Text className="text-ui-fg-muted">
            {market?.name ?? view.provider} · {market?.currency ?? "—"}
          </Text>
        </div>
        <div className="flex items-center gap-x-2">
          <StatusBadge color={view.enabled ? "green" : "grey"}>
            {view.enabled ? "Enabled" : "Disabled"}
          </StatusBadge>
          <Badge size="2xsmall">
            {view.registered ? "Registered" : "Not registered"}
          </Badge>
          <Badge size="2xsmall" color={view.configured ? "green" : "red"}>
            {view.configured ? "Configured" : "Not configured"}
          </Badge>
        </div>
      </div>

      {!view.registered && (
        <Alert variant="warning">
          This provider is not registered in the backend environment. Add{" "}
          <code>{view.provider}</code> to <code>PAYMENT_PROVIDER</code> and
          restart before it can accept payments.
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-y-1">
          <Label>Enabled</Label>
          <Text className="text-ui-fg-muted">
            Allow new payment sessions with {view.display_name}. Existing
            payments and history are never affected.
          </Text>
        </div>
        <Switch
          checked={form.enabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({ ...prev, enabled: checked }))
          }
        />
      </div>

      <div className="flex flex-col gap-y-2">
        <Label>Environment</Label>
        <Select
          value={form.environment}
          onValueChange={(value) =>
            setForm((prev) => ({ ...prev, environment: value }))
          }
        >
          <Select.Trigger>
            <Select.Value placeholder="Select environment" />
          </Select.Trigger>
          <Select.Content>
            {environments.map((environment) => (
              <Select.Item key={environment.value} value={environment.value}>
                {environment.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>

      {publicFields.length > 0 && (
        <div className="flex flex-col gap-y-4">
          <Label>Configuration</Label>
          {publicFields.map((field) => {
            const value = form.publicValues[field.key]
            const isBoolean = typeof value === "boolean"
            return (
              <div key={field.key} className="flex flex-col gap-y-1">
                <Label>{field.label}</Label>
                {field.options ? (
                  <Select
                    value={String(value ?? "")}
                    onValueChange={(selected) =>
                      setForm((prev) => ({
                        ...prev,
                        publicValues: {
                          ...prev.publicValues,
                          [field.key]: selected,
                        },
                      }))
                    }
                  >
                    <Select.Trigger>
                      <Select.Value placeholder={fieldPlaceholder(field)} />
                    </Select.Trigger>
                    <Select.Content>
                      {field.options.map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                ) : isBoolean ? (
                  <Switch
                    checked={Boolean(value)}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({
                        ...prev,
                        publicValues: {
                          ...prev.publicValues,
                          [field.key]: checked,
                        },
                      }))
                    }
                  />
                ) : (
                  <Input
                    value={String(value ?? "")}
                    placeholder={fieldPlaceholder(field)}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        publicValues: {
                          ...prev.publicValues,
                          [field.key]: event.target.value,
                        },
                      }))
                    }
                  />
                )}
                <FieldDescription field={field} />
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-col gap-y-4">
        <Label>Credentials</Label>
        {secretFields.map((field) => {
          const isStored = view.secrets_configured.includes(field.key)
          return (
            <div key={field.key} className="flex flex-col gap-y-1">
              <Label>{field.label}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={form.secretValues[field.key] ?? ""}
                placeholder={
                  isStored ? "•••••••••••••••• (stored)" : fieldPlaceholder(field)
                }
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    secretValues: {
                      ...prev.secretValues,
                      [field.key]: event.target.value,
                    },
                  }))
                }
              />
              <FieldDescription field={field} />
              <Text className="text-ui-fg-muted">
                {isStored
                  ? "Leave blank to keep the stored value; type a new value to rotate it."
                  : "Enter the credential to store it (encrypted at rest)."}
              </Text>
            </div>
          )
        })}
        <div className="flex flex-col gap-y-1">
          <Label>Webhook endpoint</Label>
          <Text className="text-ui-fg-muted">
            <code>{view.webhook_path}</code>
            {view.has_webhook_secret
              ? " · signing secret configured"
              : " · signing secret NOT configured"}
          </Text>
        </div>
      </div>

      <div className="flex items-center gap-x-2">
        <Button
          variant="secondary"
          isLoading={testing}
          disabled={!view.registered}
          onClick={onTest}
        >
          Test connection
        </Button>
        <Button isLoading={saving} onClick={onSave}>
          Save
        </Button>
      </div>

      {testResult && (
        <Alert variant={testResult.status === "ok" ? "success" : "error"}>
          {testResult.status === "ok"
            ? "Connection test passed."
            : `Connection test failed: ${testResult.error ?? "unknown error"}`}
        </Alert>
      )}

      {view.last_tested_at && (
        <Text className="text-ui-fg-muted">
          Last tested: {new Date(view.last_tested_at).toLocaleString()}
          {view.last_test_status === "failed" && view.last_test_error
            ? ` (${view.last_test_error})`
            : ""}
        </Text>
      )}
    </Container>
  )
}

const PaymentProvidersPage = () => {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<{
    kind: "success" | "error"
    message: string
  } | null>(null)

  const { data, isLoading, isError } = useQuery<ListResponse>({
    queryKey: ["payment-provider-config"],
    queryFn: () =>
      fetchJson<ListResponse>("/admin/payment-provider-config", {
        method: "GET",
      }),
  })

  const providers = useMemo(() => data?.payment_providers ?? [], [data])

  const onSaved = (provider: string) => {
    setNotice({
      kind: "success",
      message: `${provider === "safepay" ? "Safepay" : "Stripe"} configuration saved.`,
    })
    void queryClient.invalidateQueries({ queryKey: ["payment-provider-config"] })
  }

  return (
    <div className="flex flex-col gap-y-6 p-6">
      <div className="flex flex-col gap-y-1">
        <Heading level="h1">Payment Providers</Heading>
        <Text className="text-ui-fg-muted">
          Configure Safepay (Pakistan / PKR) and Stripe (UAE / AED). Credentials
          are encrypted at rest and never shown again after saving.
        </Text>
      </div>

      {notice && (
        <Alert variant={notice.kind === "success" ? "success" : "error"}>
          {notice.message}
        </Alert>
      )}

      {isLoading && <Text>Loading payment provider configuration…</Text>}
      {isError && (
        <Alert variant="error">
          Unable to load payment provider configuration. Check that you are
          signed in to the Admin.
        </Alert>
      )}

      {providers.map((view) => (
        <ProviderCard
          key={view.provider}
          view={view}
          onSaved={() => onSaved(view.provider)}
          onError={(message) =>
            setNotice({ kind: "error", message })
          }
        />
      ))}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Payment Providers",
})

export default PaymentProvidersPage
