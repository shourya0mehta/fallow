import { describe, expect, it } from "vitest";
import { classifyPrompt } from "../classify";
import { actorFor } from "../events";

describe("classifyPrompt", () => {
  it("files a drafting request under composition as a passive answer-ask", () => {
    const c = classifyPrompt("Write me a cover letter for a marketing internship at a small startup");
    expect(c.domains[0].id).toBe("composition");
    expect(c.askType).toBe("answer");
    expect(c.icap).toBe("passive");
    expect(actorFor(c)).toBe("ai");
  });

  it("files a debugging request under analysis and implementation", () => {
    const c = classifyPrompt("why doesn't this work? TypeError: cannot read properties of undefined\n```js\nconst x = a.b.c\n```");
    const ids = c.domains.map((d) => d.id);
    expect(ids[0]).toBe("analysis");
    expect(ids).toContain("implementation");
    expect(c.signals).toContain("code-shaped text");
  });

  it("recognises a hint request as constructive shared work", () => {
    const c = classifyPrompt("Give me a hint for this integral, don't give me the answer: integral of x e^x dx");
    expect(c.askType).toBe("hint");
    expect(c.icap).toBe("constructive");
    expect(c.domains[0].id).toBe("quantitative");
    expect(actorFor(c)).toBe("shared");
  });

  it("recognises a review of the person's own draft", () => {
    const c = classifyPrompt("Here's my draft of the email to my manager, can you check my tone?");
    expect(c.askType).toBe("review");
    expect(c.icap).toBe("constructive");
    expect(c.domains[0].id).toBe("composition");
  });

  it("files summarisation under synthesis", () => {
    const c = classifyPrompt("Summarize the key points of this paper on sleep and memory");
    expect(c.domains[0].id).toBe("synthesis");
  });

  it("files planning and ideation", () => {
    expect(classifyPrompt("Make me a study plan for the next three weeks with milestones").domains[0].id).toBe("planning");
    expect(classifyPrompt("Brainstorm ten names for a bakery").domains[0].id).toBe("ideation");
  });

  it("files navigation and verbal expression", () => {
    expect(classifyPrompt("How do I get to the airport without taking the highway?").domains[0].id).toBe("navigation");
    expect(classifyPrompt("What should I say to my landlord about the broken heater?").domains[0].id).toBe("verbal");
  });

  it("files bare recall questions", () => {
    const c = classifyPrompt("What's the syntax for a Python list comprehension with a condition?");
    expect(c.domains[0].id).toBe("recall");
  });

  it("falls back on prompt shape with low confidence", () => {
    const c = classifyPrompt("hmm, thoughts?");
    expect(c.confidence).toBeLessThanOrEqual(0.2);
    expect(c.domains).toHaveLength(1);
  });

  it("caps at three domains whose weights sum to one", () => {
    const c = classifyPrompt("Write a function, then summarize the paper, calculate the mean, and plan the sprint");
    expect(c.domains.length).toBeLessThanOrEqual(3);
    const sum = c.domains.reduce((a, d) => a + d.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.03);
  });

  it("treats an interactive request as interactive", () => {
    const c = classifyPrompt("Let's argue this out. Push back on my claim that GPS use erodes spatial memory.");
    expect(c.icap).toBe("interactive");
  });
});

describe("classifyPrompt, code vs prose", () => {
  it("does not credit composition for 'write' when the request is code", () => {
    const c = classifyPrompt("Write the SQL to get weekly active users by cohort for the dashboard");
    expect(c.domains[0].id).toBe("implementation");
    expect(c.domains.find((d) => d.id === "composition")).toBeUndefined();
  });

  it("still credits composition for prose requests", () => {
    const c = classifyPrompt("Write a short bio for the hackathon team page");
    expect(c.domains[0].id).toBe("composition");
  });

  it("treats 'how do I tell' as a request, not an explanation", () => {
    const c = classifyPrompt("How do I tell my teammate the PR needs to be split up?");
    expect(c.askType).not.toBe("explain");
    expect(c.domains[0].id).toBe("verbal");
  });
});

describe("classifyPrompt, false positives", () => {
  it("does not read '.map' in a stack trace as navigation", () => {
    const c = classifyPrompt("Why doesn't this work? TypeError: Cannot read properties of undefined (reading 'map')\nconst rows = data.items.map(r => r.id)");
    expect(c.domains.find((d) => d.id === "navigation")).toBeUndefined();
    expect(c.domains[0].id).toBe("analysis");
  });
});

describe("classifyPrompt, API routes are not roads", () => {
  it("files a Next.js API route request under implementation only", () => {
    const c = classifyPrompt("Generate the boilerplate for a Next.js API route that validates the body");
    expect(c.domains[0].id).toBe("implementation");
    expect(c.domains.find((d) => d.id === "navigation")).toBeUndefined();
  });
  it("still recognises a route request on foot", () => {
    expect(classifyPrompt("What's the fastest route to the train station from here?").domains[0].id).toBe("navigation");
  });
});
