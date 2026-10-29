
import { defineGame } from '@doot-games/sdk'
import { externalChallengeBlock } from '../../blocks/external-challenge/block'

const createConfig = () => ({
  title: 'External Challenge',
  rounds: [
    {
      block: 'external-challenge',
      content: {
        title: 'Nidhogg Duel',
        description: 'Euer K.-o.-Turnier: Spielt die Duelle außerhalb von Doot. Der Host bestätigt jeden Sieger.',
      },
    },
  ],
})

export const externalChallenge = defineGame({
  manifest: {
    id: 'external-challenge',
    name: 'External Challenge',
    description: 'Externe Duelle wie Nidhogg oder Wii Bowling mit manueller Punktevergabe.',
    version: '0.1.0',
    author: 'doctorbaguette',
    capabilities: [],
    flagship: true,
  },

  blocks: [externalChallengeBlock],

  defaultConfig: createConfig(),

  buildConfig: createConfig,
})
