import type { DomainId } from "../core/types";

/**
 * The asks behind the demo garden ("Peek at a demo"): everyday requests anyone
 * might send an AI, one bank per plant. `npm run seed:demo` samples them into
 * src/data/demo.json, and a test checks each one still files under its plant
 * and lands on the right side of the ledger.
 *
 * `ai`: asks that hand the work over (filed as "AI did it").
 * `shared`: hints, explanations and reviews of your own attempt (filed as "Shared").
 */
export interface DemoBank {
  ai: string[];
  shared: string[];
}

export type AskDomain = Exclude<DomainId, "attention">;

export const DEMO_ASKS: Record<AskDomain, DemoBank> = {
  composition: {
    ai: [
      "Write a cover letter for a marketing internship.",
      "Draft an email asking my team to move Friday's meeting.",
      "Write a short bio for my portfolio website.",
      "Rewrite this paragraph so it sounds less formal.",
      "Write a thank-you note to the person who interviewed me.",
      "Write a LinkedIn post announcing my new job.",
      "Write a five-paragraph essay on the causes of the French Revolution.",
      "Write an Instagram caption for a photo of my dog at the beach.",
      "Draft a memo about the new expense policy.",
      "Write the conclusion for my history essay.",
      "Make this email sound more professional.",
      "Write a product description for a handmade candle.",
      "Write a complaint letter about a late delivery.",
      "Draft a newsletter intro for our book club.",
      "Write a cover letter for a part-time job at a bookstore.",
      "Rewrite my resume so it fits on one page.",
    ],
    shared: [
      "Here's my draft of the cover letter. Can you check the tone?",
      "Proofread my essay intro and tell me what's unclear.",
      "Here's my draft of the email to my landlord. Is the tone okay?",
      "Give me feedback on my opening paragraph, but don't rewrite it.",
      "Review my essay and point out the weakest paragraph.",
    ],
  },
  analysis: {
    ai: [
      "Fix this error: Cannot read properties of undefined.",
      "Debug this: the page loads forever after I click submit.",
      "Find the bug in this loop.",
      "The login form is broken on mobile. Fix this.",
      "Root cause this: the build fails every Monday morning.",
      "Debug this: my totals come out wrong every time.",
      "Diagnose the error in this stack trace.",
      "Compare these two job offers and tell me which is better.",
      "Evaluate the tradeoff between renting and buying a car.",
      "My app crashes with a null exception on startup. Debug it.",
    ],
    shared: [
      "Why does my for loop skip the last item?",
      "Walk me through why this proof works.",
      "Why doesn't my loop ever stop?",
      "Give me a hint for this logic puzzle. Don't solve it.",
      "Why does my phone battery drain overnight?",
      "Help me understand why this argument is a fallacy.",
      "Why isn't my sourdough rising?",
      "I think the bug is in the date check. Is this right?",
    ],
  },
  quantitative: {
    ai: [
      "Calculate a 15% tip on $86.40.",
      "Convert 72 degrees Fahrenheit to Celsius.",
      "Solve for x: 3x + 7 = 22.",
      "Calculate the monthly payment on a $20,000 loan at 6% interest.",
      "Find the average of 12, 15, 9, 22 and 18.",
      "Estimate how many piano tuners work in New York.",
      "Compute the standard deviation of these test scores.",
      "How much will I save in a year if I put away $150 a week?",
      "Work out the probability of rolling two sixes.",
      "Calculate how long the drive takes at 65 mph for 230 miles.",
      "What's 18% of 2,340?",
      "Convert 5 kilometers to miles.",
    ],
    shared: [
      "Give me a hint on this integral, but don't give me the answer.",
      "Explain the formula for compound interest with a simple example.",
      "I got 42% on this probability question. Can you check my work?",
      "Walk me through how to calculate a percentage change.",
    ],
  },
  recall: {
    ai: [
      "What's the capital of Australia?",
      "Remind me how to undo the last commit in Git.",
      "What's the keyboard shortcut to take a screenshot on a Mac?",
      "Who was the first woman to win a Nobel Prize?",
      "When did the Berlin Wall fall?",
      "What does the acronym NASA stand for?",
      "Define the word ubiquitous.",
      "What's the syntax for a list comprehension?",
      "Translate good morning into French.",
      "What year did the first iPhone come out?",
      "Which command shows disk usage in the terminal?",
      "What's the name of the tallest mountain in Africa?",
      "What is the boiling point of water in Fahrenheit?",
      "Remind me what the difference between affect and effect is.",
    ],
    shared: ["I think the capital of Canada is Toronto. Is this right?"],
  },
  synthesis: {
    ai: [
      "Summarize this article in five bullet points.",
      "Give me the key points of this report.",
      "TL;DR this thread for me.",
      "Summarize this chapter for my book club.",
      "What are the main takeaways from this podcast transcript?",
      "Turn this meeting transcript into a short summary.",
      "Give me an overview of this document.",
      "Pull the main points out of these lecture notes.",
      "Summarize this research paper in plain English.",
      "Give me the takeaways from this product review.",
    ],
    shared: ["Here's my summary of the article. Did I miss anything important?"],
  },
  navigation: {
    ai: [
      "How do I get to the airport by public transit?",
      "Give me walking directions to the nearest pharmacy.",
      "Find the fastest route to the stadium from downtown.",
      "Which way is north from the train station?",
      "Where is the closest coffee shop to my hotel?",
      "How far is the walk from the hotel to the museum?",
      "Give me a driving route that avoids tolls.",
      "Read me the directions to the trailhead.",
    ],
    shared: [],
  },
  planning: {
    ai: [
      "Make a study plan for my exams next week.",
      "Plan a three-day trip to Lisbon.",
      "Create a weekly schedule that fits in three workouts.",
      "Break down this project into steps with deadlines.",
      "Prioritize my to-do list for today.",
      "Make a packing checklist for a camping trip.",
      "Put together a timeline for a surprise birthday party.",
      "Set an agenda for Monday's team meeting.",
      "Organize my week so I have time to study.",
      "Plan a week of simple dinners.",
    ],
    shared: ["Here's my plan for the move. What am I missing?"],
  },
  ideation: {
    ai: [
      "Brainstorm ten names for a bakery.",
      "Give me ideas for a 30th birthday party.",
      "Come up with a slogan for a bike repair shop.",
      "Suggest a theme for a team-building day.",
      "What could I make for dinner with eggs, rice and spinach?",
      "Give me five title ideas for my travel videos.",
      "Brainstorm gift ideas for my dad, who loves gardening.",
      "Suggest alternatives to a slide deck for my presentation.",
      "Pitch me three angles for a short story.",
      "Come up with a name for my fantasy football team.",
    ],
    shared: [
      "Here's my list of ideas for the fundraiser. Which ones are strongest?",
      "I came up with five names for the podcast. Give me feedback on them.",
    ],
  },
  implementation: {
    ai: [
      "Write a Python function that removes duplicates from a list.",
      "Write a SQL query that finds customers with no orders.",
      "Write a regex that matches US phone numbers.",
      "Write a spreadsheet function that adds up the sales column.",
      "Create a React component for a dropdown menu.",
      "Write a bash script that renames every photo in a folder.",
      "Turn this JSON into YAML.",
      "Write unit tests for this function.",
      "Refactor this code to use async and await.",
      "Generate the boilerplate for a Node.js API endpoint.",
      "Write the CSS to center a div.",
      "Create a Dockerfile for a small Flask app.",
      "Write a JavaScript function that formats dates.",
      "Write a Python script that emails me when a website changes.",
    ],
    shared: [
      "Here's my code for the login page. Can you review it?",
      "Explain what this regex does, piece by piece.",
      "Give me a hint for this Python exercise, but don't give me the answer.",
      "I wrote this function. Is the recursion right?",
    ],
  },
  verbal: {
    ai: [
      "What should I say when I ask for a raise?",
      "How do I tell my roommate to clean up without starting a fight?",
      "Reply to this message politely declining the invitation.",
      "Give me a short speech for my best friend's birthday.",
      "Help me prepare answers for a job interview.",
      "How should I apologize to a friend I let down?",
      "Give me some small talk topics for a networking event.",
      "Help me negotiate a lower price on a used car.",
    ],
    shared: [],
  },
};

/** Practice sessions, in the words the garden's own sessions log them. */
export const DEMO_PRACTICE: Record<DomainId, string[]> = {
  composition: ["wrote the first draft of my cover letter by hand", "drafted the email myself, then asked for a critique", "wrote the opening paragraph without help"],
  analysis: ["found the bug myself with two hypotheses", "worked out why the test failed before asking"],
  quantitative: ["did the budget math on paper first"],
  recall: ["quizzed myself before looking anything up"],
  synthesis: ["read the paper and wrote my own three-line summary"],
  navigation: ["walked to the museum without a map"],
  planning: ["sketched the week on paper before asking"],
  ideation: ["listed ten ideas of my own before asking for more"],
  implementation: ["wrote the function and its first test myself", "built the form validation without help"],
  verbal: ["practiced my answer out loud before the call"],
  attention: ["reading with my phone in another room", "one problem, notifications off"],
};
