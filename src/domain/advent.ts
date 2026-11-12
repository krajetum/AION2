// The Advent calendar's jokes, one per door (1-24 December), in English: Christmas cracker jokes from the pages below
// (checked 2026-11-12), credited under each joke with a link. Wording as published, spelling slips fixed.

export interface Joke { setup: string; punchline: string; credit: string; url?: string }

/** Top 20 of the "worst" cracker jokes, as voted by thortful's visitors. */
const BCG_WORST = { credit: "British Comedy Guide", url: "https://www.comedy.co.uk/features/bad-christmas-cracker-jokes/" };
/** Gold's 2013 contest to modernise the cracker joke: the top 10 and near misses. */
const BCG_MODERN = { credit: "British Comedy Guide", url: "https://www.comedy.co.uk/features/top_10_new_christmas_cracker_jokes" };
/** thortful's 2020 poll, and the jokes that missed its top ten. */
const CHORTLE = { credit: "Chortle", url: "https://www.chortle.co.uk/punching-ups/2020/12/21/47534/ten_of_the_worst_christmas_cracker_jokes" };

const j = (setup: string, punchline: string, src: { credit: string; url: string }): Joke => ({ setup, punchline, ...src });

/** Door n's joke is JOKES[n - 1]. */
export const JOKES: Joke[] = [
  j("Why is it getting harder to buy Advent calendars?", "Because their days are numbered.", BCG_MODERN),
  j("Why are Christmas trees so bad at knitting?", "Because they always drop their needles.", BCG_WORST),
  j("What do you get if you eat Christmas decorations?", "Tinsillitis.", BCG_WORST),
  j("Why did nobody bid for Rudolph and Blitzen on eBay?", "They were two deer.", BCG_WORST),
  j("What did the stamp say to the envelope?", "Stick with me and we'll go places.", BCG_WORST),
  j("Who hides in the bakery at Christmas?", "A mince spy.", BCG_WORST),
  j("What did the snowflake say to the fallen leaf?", "You are so last season.", BCG_WORST),
  j("What athlete is warmest in winter?", "A long jumper.", BCG_WORST),
  j("What do you call people who are afraid of Santa Claus?", "Claustrophobic.", BCG_WORST),
  j("What do elves learn in school?", "The elf-abet.", BCG_WORST),
  j("Did Rudolph go to school?", "No, he was elf-taught.", BCG_WORST),
  j("Why are Santa's deer always wet?", "Because they're reindeer!", BCG_WORST),
  j("What is Santa's favourite pizza?", "One that's deep-pan, crisp and even.", BCG_WORST),
  j("What do snowmen have for breakfast?", "Snowflakes.", BCG_WORST),
  j("What movie do the Three Wise Men watch on Christmas Day?", "A Star Is Born.", BCG_WORST),
  j("What did Santa do when he went speed dating?", "He pulled a cracker.", BCG_WORST),
  j("Why don't you ever see Santa in hospital?", "Because he has private elf care.", BCG_MODERN),
  j("Why was the Brussels sprout sent to prison?", "Because it was a repeat offender.", BCG_MODERN),
  j("Why did Rudolph have the complete works of Shakespeare on his top lip?", "Because his nose was well read.", BCG_MODERN),
  j("How did Mary and Joseph know that Jesus was 7lb 6oz when he was born?", "They had a weigh in a manger.", BCG_MODERN),
  j("What carol do they sing in the desert?", "O Camel Ye Faithful.", CHORTLE),
  j("How does Santa keep track of all the fireplaces he's visited?", "He keeps a logbook.", CHORTLE),
  j("What is the best Christmas present?", "A broken drum: you can't beat it!", BCG_WORST),
  j("What did Adam say the day before Christmas?", "\"It's Christmas, Eve!\"", BCG_WORST),
];
