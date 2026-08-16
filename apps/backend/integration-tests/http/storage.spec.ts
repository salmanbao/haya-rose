import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import fs from "fs"
import path from "path"

const ADMIN_EMAIL = "admin@baby-store.test"
const ADMIN_PASSWORD = "SuperSecretTest123!"

const PNG_MIME = "image/png"

const getAdminToken = async (api: any, container: any) => {
  await api.post("/auth/user/emailpass/register", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })

  const userModule = container.resolve(Modules.USER)
  const authModule = container.resolve(Modules.AUTH)

  const [user] = await userModule.createUsers([
    { email: ADMIN_EMAIL, first_name: "Test", last_name: "Admin" },
  ])

  const [providerIdentity] = await authModule.listProviderIdentities({
    entity_id: ADMIN_EMAIL,
    provider: "emailpass",
  })
  await authModule.updateAuthIdentities({
    id: providerIdentity.auth_identity_id,
    app_metadata: { user_id: user.id },
  })

  const login = await api.post("/auth/user/emailpass", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  return login.data.token as string
}

const buildPngUpload = (size: number) => {
  const blob = new Blob([Buffer.alloc(size, 0x89)], { type: PNG_MIME })
  const form = new FormData()
  form.append("files", blob, "test-image.png")
  return form
}

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    const localStaticDir = path.join(process.cwd(), "static")

    const localFilePath = (fileId: string) =>
      path.join(localStaticDir, fileId)

    describe("Media & Storage foundation (local provider)", () => {
      it("uploads a public image through POST /admin/uploads and persists it to the local provider", async () => {
        const container = getContainer()
        const token = await getAdminToken(api, container)

        const response = await api.post("/admin/uploads", buildPngUpload(1024), {
          headers: { Authorization: `Bearer ${token}` },
        })

        expect(response.status).toBe(200)
        expect(response.data.files).toHaveLength(1)
        const [file] = response.data.files
        expect(file.id).toBeDefined()
        expect(file.url).toBeDefined()
        expect(file.url).toContain(file.id)
        expect(fs.existsSync(localFilePath(file.id))).toBe(true)
      })

      it("retrieves uploaded file metadata through GET /admin/uploads/:id", async () => {
        const container = getContainer()
        const token = await getAdminToken(api, container)
        const upload = await api.post(
          "/admin/uploads",
          buildPngUpload(1024),
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const [{ id }] = upload.data.files

        const response = await api.get(`/admin/uploads/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        expect(response.status).toBe(200)
        expect(response.data.file.id).toBe(id)
        expect(response.data.file.url).toContain(id)
      })

      it("deletes an uploaded file through DELETE /admin/uploads/:id and removes it from the provider", async () => {
        const container = getContainer()
        const token = await getAdminToken(api, container)
        const upload = await api.post(
          "/admin/uploads",
          buildPngUpload(1024),
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const [{ id }] = upload.data.files
        expect(fs.existsSync(localFilePath(id))).toBe(true)

        const response = await api.delete(`/admin/uploads/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        expect(response.status).toBe(200)
        expect(response.data).toEqual({
          id,
          object: "file",
          deleted: true,
        })
        expect(fs.existsSync(localFilePath(id))).toBe(false)
      })

      it("rejects unauthenticated uploads", async () => {
        const response = await api.post("/admin/uploads", buildPngUpload(1024), {
          validateStatus: () => true,
        })

        expect(response.status).toBe(401)
      })

      it("rejects uploads with a disallowed file type", async () => {
        const container = getContainer()
        const token = await getAdminToken(api, container)
        const blob = new Blob([Buffer.alloc(64)], { type: "text/plain" })
        const form = new FormData()
        form.append("files", blob, "notes.txt")

        const response = await api.post("/admin/uploads", form, {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        })

        expect(response.status).toBe(400)
      })

      it("rejects uploads exceeding the configured size limit", async () => {
        const container = getContainer()
        const token = await getAdminToken(api, container)
        const configuredMb = Number(
          process.env.MEDUSA_UPLOAD_MAX_SIZE_MB || "5"
        )
        const oversizedBytes = configuredMb * 1024 * 1024 + 1

        const response = await api.post(
          "/admin/uploads",
          buildPngUpload(oversizedBytes),
          {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true,
          }
        )

        expect(response.status).toBe(400)
      })

      it("exposes no store upload route", async () => {
        const container = getContainer()
        const apiKeyModule = container.resolve(Modules.API_KEY)
        const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        const linkService = remoteLink.getLinkModule(
          Modules.API_KEY,
          "publishable_key_id",
          Modules.SALES_CHANNEL,
          "sales_channel_id"
        )!

        const key = await apiKeyModule.createApiKeys({
          title: "storage-test",
          type: "publishable",
          created_by: "",
        })
        const channel = await salesChannelModule.createSalesChannels({
          name: "storage-test",
        })
        await linkService.create(key.id, channel.id)

        const response = await api.post("/store/uploads", buildPngUpload(64), {
          headers: { "x-publishable-api-key": key.token },
          validateStatus: () => true,
        })

        expect(response.status).toBe(404)
      })
    })
  },
})

jest.setTimeout(120 * 1000)