import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("Health endpoint", () => {
      it("responds with 200", async () => {
        const response = await api.get("/health")
        expect(response.status).toBe(200)
      })
    })
  },
})

jest.setTimeout(120 * 1000)