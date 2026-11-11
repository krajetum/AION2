// The Advent calendar's jokes, one per door (1-24 December), in English. Traditional Christmas cracker jokes:
// they go round in many lists with no known author, so each is credited as such; `url` = the page it was taken from, when one is named.

export interface Joke { setup: string; punchline: string; credit: string; url?: string }

const T = "Traditional cracker joke";
const j = (setup: string, punchline: string): Joke => ({ setup, punchline, credit: T });

/** Door n's joke is JOKES[n - 1]. */
export const JOKES: Joke[] = [
  j("What do you call a cat on the beach at Christmas?", "Sandy Claws."),
  j("Why did the turkey join the band?", "Because it had the drumsticks."),
  j("What do you call an obnoxious reindeer?", "Rude-olph."),
  j("What's every elf's favourite kind of music?", "Wrap."),
  j("Who hides in the bakery at Christmas?", "A mince spy."),
  j("What do you get if you cross a snowman with a vampire?", "Frostbite."),
  j("What do Santa's little helpers learn at school?", "The elf-abet."),
  j("What do you call Santa when he stops moving?", "Santa Pause."),
  j("Why are Christmas trees so bad at knitting?", "They keep dropping their needles."),
  j("What do you get if you eat the Christmas decorations?", "Tinsilitis."),
  j("What did the stamp say to the Christmas card?", "Stick with me and we'll go places."),
  j("What's the most popular wine at Christmas?", "\"I don't like Brussels sprouts!\""),
  j("What does Santa suffer from if he gets stuck in a chimney?", "Claus-trophobia."),
  j("Why don't you ever see Santa in hospital?", "Because he has private elf care."),
  j("What do reindeer hang on their Christmas trees?", "Horn-aments."),
  j("What did Adam say on the day before Christmas?", "\"It's Christmas, Eve!\""),
  j("Why did Rudolph get a bad report card?", "He went down in history."),
  j("What do angry mice send each other at Christmas?", "Cross-mouse cards."),
  j("What do you call a snowman with a six-pack?", "An abdominal snowman."),
  j("How do snowmen get around?", "They ride an icicle."),
  j("What's red, white and goes up and down?", "Santa stuck in a lift."),
  j("Why is Santa so good at karate?", "He has a black belt."),
  j("What do snowmen eat for breakfast?", "Frosted flakes."),
  j("Why does Santa have three gardens?", "So he can ho, ho, ho."),
];
