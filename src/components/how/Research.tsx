/**
 * The research behind each design decision, condensed, with the strength of
 * each finding stated plainly. Each section opens on demand.
 */
export function Research() {
  return (
    <div className="research">
      <Section title="Handing over the answer hurts; scaffolded help does not">
        <p>
          A field experiment with about 1,000 high-school students found that unrestricted GPT-4 access raised practice scores 48% and lowered unassisted exam scores 17%, while a tutor version that gave hints
          instead of answers kept the practice gains and removed the exam loss (<A href="https://doi.org/10.1073/pnas.2422633122">Bastani et al. 2025, PNAS</A>). In a randomized study of 52 developers learning a
          new library, the AI-assisted group scored 17 points lower on a follow-up quiz, with the largest gap on debugging; what predicted learning was interaction style, not AI use as such (
          <A href="https://www.anthropic.com/research/AI-assistance-coding-skills">Anthropic 2026</A>). Explanation without a recommendation produced both good decisions and learning; a recommendation with an
          explanation produced good decisions and no learning (<A href="https://arxiv.org/abs/2202.05402">Gajos and Mamykina 2022</A>). <b>Built in:</b> the answer-versus-hint split, and the scaffold mode.
        </p>
      </Section>

      <Section title="People cannot feel the loss">
        <p>
          Experienced open-source developers were 19% slower with AI tools and believed they had been 20% faster (<A href="https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/">METR 2025</A>,
          16 developers, 246 tasks). Confidence in the AI predicted less critical thinking across 936 real tasks from 319 knowledge workers (
          <A href="https://www.microsoft.com/en-us/research/wp-content/uploads/2025/01/lee_2025_ai_critical_thinking_survey.pdf">Lee et al. 2025, CHI</A>). <b>Built in:</b> the ledger is behavioral. Felt effort and
          self-rated competence are never used as signals.
        </p>
      </Section>

      <Section title="Skill drifts in months, not decades">
        <p>
          Endoscopists&rsquo; adenoma detection rate fell from 28.4% to 22.4% in colonoscopies performed without AI after a few months of AI-assisted practice (
          <A href="https://wrap.warwick.ac.uk/id/eprint/191005">Budzyń et al. 2025, Lancet Gastroenterology and Hepatology</A>, observational, 1,443 procedures). Students&rsquo; prompting profiles diverged within
          four assignments of a single semester (<A href="https://www.sciencedirect.com/science/article/pii/S2451958826002046">Misiejuk et al. 2026</A>). <b>Built in:</b> drift detection on the delegated share over
          four trailing weeks.
        </p>
      </Section>

      <Section title="Decay is lawful and spaced repetition already models it">
        <p>
          Across 53 studies, skill loss grew with the retention interval and was larger for abstract, feedback-free cognitive procedures than for natural or physical tasks (
          <A href="https://doi.org/10.1207/s15327043hup1101_3">Arthur et al. 1998</A>). Spacing beat massing in 259 of 271 comparisons (<A href="https://doi.org/10.1037/0033-2909.132.3.354">Cepeda et al. 2006</A>).
          Generating an answer beats reading it, d = 0.40 across 86 studies (<A href="https://doi.org/10.3758/BF03193441">Bertsch et al. 2007</A>); trying a problem before instruction helps conceptual knowledge and
          not rote procedure (<A href="https://doi.org/10.3102/00346543211019105">Sinha and Kapur 2021</A>). <b>Built in:</b> each domain is a card under the open-source{" "}
          <A href="https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm">FSRS</A> power law, with priors by decay class and attempt-first aimed at conceptual work. <b>Labelled a guess:</b> the
          priors themselves, which were fitted on flashcards, not skills.
        </p>
      </Section>

      <Section title="The one earlier offload with a clean cost: GPS">
        <p>
          Lifetime GPS use correlated with worse hippocampus-dependent spatial memory, and heavier use over three years predicted steeper decline in a small longitudinal sample (
          <A href="https://doi.org/10.1038/s41598-020-62877-0">Dahmani and Bohbot 2020</A>). Navigation deficits precede memory deficits in preclinical Alzheimer&rsquo;s disease, and in Sea Hero Quest genetic-risk
          carriers separated on wayfinding but not on memory tests (<A href="https://doi.org/10.1073/pnas.1901600116">Coughlan et al. 2019, PNAS</A>). Calculators, by contrast, came out neutral or positive in two
          meta-analyses, and the Google effect failed replication in 2018. <b>Built in:</b> a navigation domain from day one. <b>Left out:</b> any claim about search engines or handwriting.
        </p>
      </Section>

      <Section title="What depletes in a day is sleep pressure, not dopamine">
        <p>
          The three-process model predicts alertness from time awake and clock time with published constants and was validated on 136 airline crew and 8,040 sleepiness ratings (
          <A href="https://pubmed.ncbi.nlm.nih.gov/9095372/">Åkerstedt and Folkard 1997</A>; <A href="https://doi.org/10.1371/journal.pone.0108679">Ingre et al. 2014</A>). About six hours of demanding work raised
          lateral-prefrontal glutamate and shifted choices toward low effort in one study (<A href="https://doi.org/10.1016/j.cub.2022.07.010">Wiehler et al. 2022</A>). The daily willpower tank did not survive
          replication: d = 0.04 across 23 labs and d = 0.06 across 36 (<A href="https://doi.org/10.1177/1745691616652873">Hagger et al. 2016</A>; <A href="https://doi.org/10.1177/0956797621989733">Vohs et al. 2021</A>),
          and dopamine does not drain when you avoid stimulation. <b>Built in:</b> the three-process curve with a chronotype shift. <b>Labelled a hypothesis:</b> the fatigue term. <b>Left out:</b> any dopamine
          variable.
        </p>
      </Section>

      <Section title="Push-back that works comes before the answer, and people like it least">
        <p>
          Cognitive forcing functions cut overreliance on AI more than explanations did, and &ldquo;people assigned the least favorable subjective ratings to the designs that reduced the overreliance the most&rdquo;
          (<A href="https://arxiv.org/abs/2102.09692">Buçinca, Malaya, Gajos 2021</A>). Explanations reduce overreliance only when they make checking cheaper than deferring (
          <A href="https://arxiv.org/abs/2212.06823">Vasconcelos et al. 2023</A>). <b>Built in:</b> the verdict before the send, a verification checklist in co-pilot mode, user-set intensity, and a quiet switch.
        </p>
      </Section>

      <Section title="Screens: friction works, locks do not last">
        <p>
          A breathing pause before an app opened led people to close it in 36% of attempts and cut openings 57% over six weeks (<A href="https://doi.org/10.1073/pnas.2213114120">Grüning et al. 2023, PNAS</A>).
          Reviews of digital self-control tools find short-term reductions and no lasting habit change from blocking (<A href="https://elite.polito.it/news/2023/05/31/tochi-dscts">Roffarello and De Russis 2023</A>).
          Switching between videos to escape boredom makes people more bored (<A href="https://www.apa.org/news/press/releases/2024/08/online-videos-boredom">Tam and Inzlicht 2024</A>). Office workers took about
          25 minutes to return to an interrupted task (<A href="https://ics.uci.edu/~gmark/CHI2005.pdf">Mark et al. 2005</A>). The media-multitasking literature is small and contested. <b>Built in:</b> the pause,
          a self-set budget shown rather than enforced, switches per hour reported as behavior. <b>Left out:</b> any claim that screens damage attention.
        </p>
      </Section>

      <Section title="Brain health: maintenance, never detection">
        <p>
          The 2024 Lancet Commission names 14 modifiable factors accounting for up to 45% of dementia, as a theoretical ceiling (<A href="https://www.eurekalert.org/news-releases/1052982">Livingston et al. 2024</A>).
          The best multidomain trials show differences of 0.02 to 0.03 standard deviations a year (<A href="https://doi.org/10.1016/S0140-6736(15)60461-5">FINGER</A>;{" "}
          <A href="https://doi.org/10.1001/jama.2025.12923">US POINTER 2025</A>). Young-onset dementia runs about 1 per 100,000 at ages 30 to 34, so a detector for young adults has no predictive value (
          <A href="https://doi.org/10.1001/jamaneurol.2021.2161">Hendriks et al. 2021</A>). Brain-training games improve the trained task and little else across 11,430 people (
          <A href="https://doi.org/10.1038/nature09042">Owen et al. 2010</A>). <b>Built in:</b> the vocabulary of trends and habits. <b>Left out:</b> risk scores, detection, any disease claim, and games.
        </p>
      </Section>

      <Section title="Brain regions: engagement, not training">
        <p>
          Knowing a task activates a region says little about what exercising the region does, because most regions serve many processes (
          <A href="https://doi.org/10.1016/j.tics.2005.12.004">Poldrack 2006</A>). The lateral prefrontal and parietal &ldquo;multiple-demand&rdquo; network lights up for nearly any hard task (
          <A href="https://doi.org/10.1016/j.tics.2010.01.004">Duncan 2010</A>). Open resources exist for the mapping itself: the <A href="https://www.cognitiveatlas.org">Cognitive Atlas</A>,{" "}
          <A href="https://neurosynth.org">Neurosynth</A>, and <A href="https://www.onetcenter.org/content.html/1.A?d=1">O*NET&rsquo;s abilities taxonomy</A>. <b>Built in:</b> a one-line group-average note under
          each domain. <b>Left out:</b> any meter that claims to measure a region.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="more">
      <summary>{title}</summary>
      {children}
    </details>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
