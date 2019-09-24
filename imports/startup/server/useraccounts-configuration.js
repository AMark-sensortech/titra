import { Accounts } from 'meteor/accounts-base'
import { AccountsAnonymous } from 'meteor/brettle:accounts-anonymous'
import dockerNames from 'docker-names'
import initNewUser from '../../api/projects/setup.js'

Accounts.onCreateUser((options, user) => {
  if (options.anonymous) {
    options.profile = {
      name: dockerNames.getRandomName(),
      currentLanguageProject: 'Projekt',
      currentLanguageProjectDesc: 'Dieses Projekt wurde automatisch erstellt, Sie können es nach Belieben bearbeiten. Wussten Sie, dass Sie Emojis wie 💰 ⏱ 👍 überall verwenden können?',
    }
  }
  initNewUser(user._id, options)
  const localUser = user
  if (options.profile) {
    localUser.profile = options.profile
    delete localUser.profile.currentLanguageProject
    delete localUser.profile.currentLanguageProjectDesc
  }
  return localUser
})
