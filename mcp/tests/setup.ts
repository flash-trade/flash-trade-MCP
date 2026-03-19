import { setupServer } from 'msw/node'
import { handlers } from './mocks/handlers.ts'
import { beforeAll, afterEach, afterAll } from 'vitest'

export const mockServer = setupServer(...handlers)

beforeAll(() => mockServer.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => mockServer.resetHandlers())
afterAll(() => mockServer.close())
