import { createHash, randomInt } from 'node:crypto'

// Fun anonymous names for the Freedom Wall: "Anonymous Sleepy Koala".
// A name is picked at random for every post and stored with that post. It is
// never derived from the author (no user id, no email, no session), so
// nobody with access to the database can work out who wrote what.

const ADJECTIVES = [
  'Sleepy', 'Brave', 'Sneaky', 'Grumpy', 'Fuzzy', 'Cheerful', 'Curious', 'Mighty', 'Dizzy', 'Chatty',
  'Mysterious', 'Speedy', 'Gentle', 'Jolly', 'Clumsy', 'Witty', 'Quiet', 'Bouncy', 'Cozy', 'Sassy',
  'Daring', 'Dreamy', 'Fancy', 'Giggly', 'Hungry', 'Lucky', 'Mellow', 'Nimble', 'Proud', 'Silly',
  'Shy', 'Sunny', 'Swift', 'Wise', 'Zany', 'Cuddly', 'Breezy', 'Plucky', 'Rowdy', 'Snazzy',
] as const

const ANIMALS: Record<string, string> = {
  Koala: '🐨', Otter: '🦦', Penguin: '🐧', Capybara: '🦫', Hedgehog: '🦔', Llama: '🦙', Raccoon: '🦝',
  Walrus: '🦭', Flamingo: '🦩', Parrot: '🦜', Owl: '🦉', Sloth: '🦥', Panda: '🐼', Fox: '🦊',
  Hamster: '🐹', Rabbit: '🐰', Dolphin: '🐬', Turtle: '🐢', Octopus: '🐙', Giraffe: '🦒', Zebra: '🦓',
  Hippo: '🦛', Kangaroo: '🦘', Squirrel: '🐿️', Duck: '🦆', Frog: '🐸', Bee: '🐝', Ladybug: '🐞',
  Seal: '🦭', Peacock: '🦚', Swan: '🦢', Badger: '🦡', Bat: '🦇', Camel: '🐪', Elephant: '🐘',
  Lion: '🦁', Tiger: '🐯', Wolf: '🐺', Whale: '🐳', Hen: '🐔',
}

const ANIMAL_NAMES = Object.keys(ANIMALS)

export function randomAlias(): string {
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)]
  const animal = ANIMAL_NAMES[randomInt(ANIMAL_NAMES.length)]
  return `Anonymous ${adjective} ${animal}`
}

// Picks a name not used by the recent posts, so two people are rarely given
// the same name on one screen. Falls back to a plain random name.
export function freshAlias(recent: Set<string>): string {
  for (let i = 0; i < 8; i++) {
    const candidate = randomAlias()
    if (!recent.has(candidate)) return candidate
  }
  return randomAlias()
}

// A post written before names existed gets one derived from the POST's own
// id (never from an author), so it keeps the same name every time it loads.
export function aliasForOldPost(postId: string): string {
  const h = createHash('sha256').update(postId).digest()
  return `Anonymous ${ADJECTIVES[h[0] % ADJECTIVES.length]} ${ANIMAL_NAMES[h[1] % ANIMAL_NAMES.length]}`
}

export function emojiFor(alias: string): string {
  const animal = alias.split(' ').pop() ?? ''
  return ANIMALS[animal] ?? '🕵️'
}
