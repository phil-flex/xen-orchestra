/* eslint-env jest */

import {
  createUser,
  deleteUsers,
  getConnection,
  getUser,
  xo
} from './util'

// ===================================================================

describe('user', () => {
  let userIds = []

  afterEach(async () => {
    await deleteUsers(xo, userIds)
    userIds = []
  })

  // =================================================================

  describe('.create()', () => {
    it('creates an user and returns its id', async () => {
      const userId = await createUser(xo, userIds, {
        email: 'wayne@vates.fr',
        password: 'batman'
      })

      expect(typeof userId).toBe('string')

      const user = await getUser(xo, userId)
      expect(user).toEqual({
        id: userId,
        email: 'wayne@vates.fr'
      })
    })

    it.skip('does not create two users with the same email', async () => {
      await createUser(xo, userIds, {
        email: 'wayne@vates.fr',
        password: 'batman'
      })

      await createUser(xo, userIds, {
        email: 'wayne@vates.fr',
        password: 'alfred'
      }).then(
        () => {
          throw new Error('createUser() should have thrown')
        },
        error => {
          expect(error.message).toMatch(/already exists/i)
        }
      )
    })

    it('can set the user permission', async () => {
      const userId = await createUser(xo, userIds, {
        email: 'wayne@vates.fr',
        password: 'batman',
        permission: 'admin'
      })

      const user = await getUser(xo, userId)
      expect(user).toEqual({
        id: userId,
        email: 'wayne@vates.fr',
        permission: 'admin'
      })
    })

    it('allows the user to sign in', async () => {
      await createUser(xo, userIds, {
        email: 'wayne@vates.fr',
        password: 'batman'
      })

      await getConnection({credentials: {
        email: 'wayne@vates.fr',
        password: 'batman'
      }})
    })
  })

  // -----------------------------------------------------------------

  describe('.delete()', () => {
    it('deletes an user', async () => {
      const userId = await xo.call('user.create', {
        email: 'wayne@vates.fr',
        password: 'batman'
      })

      await xo.call('user.delete', {
        id: userId
      })
      const user = await getUser(xo, userId)
      expect(user).toBeUndefined()
    })

    it('not allows an user to delete itself', async () => {
      await xo.call('user.delete', {id: xo.user.id}).then(
        () => {
          throw new Error('user.delete() should have thrown')
        },
        function (error) {
          expect(error.message).toBe('a user cannot delete itself')
        }
      )
    })
  })

  // -----------------------------------------------------------------

  describe('.getAll()', () => {
    it('returns an array', async () => {
      const users = await xo.call('user.getAll')
      expect(users).toBeInstanceOf(Array)
    })
  })

  // -----------------------------------------------------------------

  describe('.set()', () => {
    let userId
    beforeEach(async () => {
      userId = await createUser(xo, userIds, {
        email: 'wayne@vates.fr',
        password: 'batman'
      })
    })

    it('changes password of an existing user', async () => {
      await xo.call('user.set', {
        id: userId,
        password: 'alfred'
      })

      await getConnection({credentials: {
        email: 'wayne@vates.fr',
        password: 'alfred'
      }})
    })

    it('changes email adress and permission of an existing user', async () => {
      await xo.call('user.set', {
        id: userId,
        email: 'batman@vates.fr',
        permission: 'admin'
      })
      const user = await getUser(xo, userId)
      expect(user).toEqual({
        id: userId,
        email: 'batman@vates.fr',
        permission: 'admin'
      })
    })
  })
})
