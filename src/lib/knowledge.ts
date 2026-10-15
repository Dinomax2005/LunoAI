/**
 * Luno Knowledge Base — curated, verified facts for instant answers.
 * Fuzzy-matched so the built-in Brain answers common questions correctly
 * with zero downloads. For open-ended knowledge, connect a neural model
 * (Local or Free Cloud) from the model picker — Luno says so honestly.
 */

export interface KBEntry {
  keys: string[];
  title: string;
  body: string;
}

export const KNOWLEDGE: KBEntry[] = [
  { keys: ["python language", "what is python", "python programming"], title: "Python", body: "Python is a high-level programming language created by Guido van Rossum and first released in 1991. It prioritises readable code, ships with a huge standard library, and is the most popular language for AI, data science, scripting and web back-ends. Code runs via an interpreter, uses indentation for blocks, and is dynamically typed." },
  { keys: ["javascript", "what is js", "js language"], title: "JavaScript", body: "JavaScript is the programming language of the web — every browser runs it. Created by Brendan Eich at Netscape in 1995 (in about 10 days), it now also runs on servers (Node.js) and powers frameworks like React, Vue and Angular. Despite the name, it is unrelated to Java." },
  { keys: ["transformer architecture", "what is a transformer", "attention is all you need"], title: "Transformers", body: "The Transformer is the neural-network architecture behind every modern LLM, introduced in the 2017 paper *Attention Is All You Need* (Vaswani et al.). Its self-attention mechanism lets the model weigh which input tokens matter for each output token, and it processes sequences in parallel — which is why it scales so well with data and compute." },
  { keys: ["machine learning", "what is ml"], title: "Machine learning", body: "Machine learning is how computers learn patterns from examples instead of following hand-written rules. A model adjusts internal parameters (weights) during training to reduce prediction error, then generalises to new data. Main flavours: supervised (labelled data), unsupervised (structure discovery) and reinforcement learning (learn by reward)." },
  { keys: ["neural network", "how do neural networks work"], title: "Neural networks", body: "A neural network is layers of simple units (neurons). Each connection has a weight; training adjusts weights by gradient descent + backpropagation so outputs match targets. Depth (many layers) lets networks learn hierarchical features — edges → shapes → objects in vision, or tokens → syntax → meaning in language models." },
  { keys: ["large language model", "what is an llm", "llm"], title: "LLMs", body: "A large language model (LLM) is a transformer trained to predict the next token across enormous text corpora. Prediction at scale produces emergent abilities: answering, reasoning, coding and conversation. Models are stored as weights (billions of numbers) and run by an inference engine. Luno runs open-weight LLMs entirely in your browser or via free tiers — no paid API." },
  { keys: ["how do llms work", "how does chatgpt work", "how do ai chatbots work"], title: "How LLM chatbots work", body: "1. Your text is split into tokens. 2. The transformer predicts the most likely next token, over and over, sampling with temperature. 3. Instruction tuning + RLHF taught it to be helpful and conversational. 4. Reasoning scaffolding (like Luno's Deep Think: plan → solve → verify) makes outputs far more reliable than raw prediction alone." },
  { keys: ["api", "what is an api"], title: "API", body: "An API (Application Programming Interface) is a contract that lets one program talk to another — endpoints, request/response formats, auth. Luno's cloud options use OpenAI-compatible APIs, so Groq, OpenRouter, Hugging Face, Ollama and any compatible server all plug into the same client code." },
  { keys: ["git", "what is git", "github"], title: "Git & GitHub", body: "Git is a distributed version-control system (by Linus Torvalds, 2005) that tracks file history via commits and branches, so teams can collaborate and roll back safely. GitHub hosts Git repositories and adds pull requests, issues and CI (Actions). Luno itself lives in a Git repo and deploys free with GitHub Pages." },
  { keys: ["photosynthesis"], title: "Photosynthesis", body: "Photosynthesis is how green plants, algae and some bacteria turn light energy into chemical energy: **6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂**. It happens in chloroplasts (using the pigment chlorophyll), produces nearly all oxygen in Earth's atmosphere, and underpins almost every food chain." },
  { keys: ["water cycle"], title: "The water cycle", body: "The water cycle moves water continuously: evaporation (oceans/lakes → vapour), transpiration (plants), condensation (clouds), precipitation (rain/snow), collection and groundwater flow — driven by the Sun. It purifies water naturally and distributes heat around the planet." },
  { keys: ["gravity", "what is gravity"], title: "Gravity", body: "Gravity is the attraction between masses. Newton described it as a force: F = G·m₁·m₂/r². Einstein's general relativity (1915) reframes it as curvature of spacetime caused by mass-energy — which correctly predicts Mercury's orbit, gravitational lensing and black holes. On Earth it accelerates objects at ~9.81 m/s²." },
  { keys: ["speed of light"], title: "Speed of light", body: "The speed of light in vacuum is exactly **299,792,458 m/s** (~300,000 km/s) — the universe's maximum speed for information. It defines the metre, underlies E = mc², and means we always see distant objects as they *were*: the Sun 8 minutes ago, other stars years to millennia ago." },
  { keys: ["capital of france"], title: "Capital of France", body: "The capital of France is **Paris** — also its largest city (~2.1M in the city, ~11M metro), home to the Eiffel Tower (completed 1889) and the French government." },
  { keys: ["capital of japan"], title: "Capital of Japan", body: "The capital of Japan is **Tokyo** — the largest metropolitan economy on Earth (~37M people in the greater area) and the seat of Japan's government and Emperor." },
  { keys: ["capital of australia"], title: "Capital of Australia", body: "The capital of Australia is **Canberra** — a planned city chosen in 1908 as a compromise between rivals Sydney and Melbourne. (Sydney is the largest city, but not the capital.)" },
  { keys: ["capital of canada"], title: "Capital of Canada", body: "The capital of Canada is **Ottawa**, Ontario — chosen by Queen Victoria in 1857. Toronto is the largest city; Ottawa is the political capital and second-largest city in Ontario." },
  { keys: ["capital of germany"], title: "Capital of Germany", body: "The capital of Germany is **Berlin** (also its largest city, ~3.7M). Bonn was West Germany's capital during division (1949–1990); Berlin became the reunified capital in 1990." },
  { keys: ["largest planet", "biggest planet"], title: "Largest planet", body: "**Jupiter** is the largest planet — 11× Earth's diameter, 318× its mass, with a volume that could hold ~1,300 Earths. Its Great Red Spot is a storm larger than Earth that has raged for centuries." },
  { keys: ["solar system", "planets in order"], title: "The Solar System", body: "In order from the Sun: **Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune**. The first four are rocky terrestrial planets; the last four are gas/ice giants. Pluto was reclassified as a dwarf planet in 2006. Mnemonic: *My Very Energetic Mother Just Served Us Noodles*." },
  { keys: ["who wrote romeo and juliet", "shakespeare"], title: "William Shakespeare", body: "William Shakespeare (1564–1616), the English playwright and poet, wrote *Romeo and Juliet*, *Hamlet*, *Macbeth*, *Othello* and 150+ sonnets. He coined or popularised hundreds of English phrases ('break the ice', 'wild goose chase') and is widely regarded as the greatest writer in English literature." },
  { keys: ["theory of evolution", "darwin evolution"], title: "Evolution", body: "Evolution by natural selection (Darwin & Wallace, 1859): organisms with heritable traits better suited to their environment survive and reproduce more, so those traits spread. Over deep time this explains the diversity of life; it is supported by fossils, DNA comparisons and observed speciation." },
  { keys: ["internet work", "how does the internet work"], title: "How the Internet works", body: "The Internet is a network of networks speaking IP. Your data is split into packets, routed across cables/fibre (most intercontinental traffic travels undersea cables), and reassembled by TCP. DNS translates names (example.com) into IP addresses; HTTPS (TLS) encrypts web traffic on top." },
  { keys: ["climate change", "global warming"], title: "Climate change", body: "Human activity — mainly burning fossil fuels and deforestation — has raised atmospheric CO₂ from ~280 ppm (pre-industrial) to ~420+ ppm, warming the planet ~1.2 °C since the late 1800s. Effects include sea-level rise, stronger heatwaves and shifting weather. Deep emissions cuts plus adaptation are the recognised response (IPCC)." },
  { keys: ["black hole"], title: "Black holes", body: "A black hole is a region where gravity is so strong that nothing — not even light — escapes inside the event horizon. They form when massive stars collapse. The first image of one (M87*, 2019) came from the Event Horizon Telescope; our galaxy hosts a 4-million-solar-mass black hole, Sagittarius A*." },
  { keys: ["human brain", "how does the brain work"], title: "The human brain", body: "The human brain has ~86 billion neurons connected by ~100 trillion synapses, consuming ~20 watts. Different regions specialise (vision in occipital cortex, language largely in left-hemisphere areas), learning physically rewires synapses, and sleep consolidates memory. We still don't fully understand consciousness — it's an open scientific frontier." },
  { keys: ["what is an atom", "atom structure"], title: "Atoms", body: "An atom is the smallest unit of ordinary matter: a nucleus of protons + neutrons (determining the element — e.g. 6 protons = carbon) surrounded by electrons in quantum orbitals. Atoms bond by sharing or transferring electrons, forming molecules and everything around you." },
  { keys: ["periodic table"], title: "The periodic table", body: "The periodic table organises the 118 known elements by atomic number (protons) into groups with similar chemistry — alkali metals, halogens, noble gases, etc. Dmitri Mendeleev published the first widely recognised version in 1869 and correctly predicted undiscovered elements." },
  { keys: ["ww2", "world war 2", "when was world war ii"], title: "World War II", body: "World War II (1939–1945) was the deadliest conflict in history (70–85M deaths). It began with Germany's invasion of Poland, spanned Europe, Africa, Asia and the Pacific, included the Holocaust, and ended with Germany's surrender in May 1945 and Japan's in September 1945 after the atomic bombings of Hiroshima and Nagasaki." },
  { keys: ["moon landing", "first man on the moon"], title: "Moon landing", body: "Apollo 11 landed on the Moon on **20 July 1969**. Neil Armstrong was the first person to walk on it ('That's one small step for [a] man, one giant leap for mankind'), followed by Buzz Aldrin, while Michael Aldrin orbited above. Twelve astronauts walked on the Moon across six Apollo landings (1969–1972)." },
  { keys: ["smallest planet"], title: "Smallest planet", body: "**Mercury** is the smallest planet — only slightly larger than Earth's Moon — and the closest to the Sun, orbiting in just 88 days. Despite the proximity, its dark side plunges below −170 °C." },
  { keys: ["boiling point of water", "water boil"], title: "Boiling point of water", body: "At sea-level pressure, water boils at **100 °C (212 °F)**. At altitude the pressure is lower so water boils cooler — about 95 °C in Denver, ~72 °C on Everest's summit — which is why cooking takes longer in the mountains." },
  { keys: ["how many continents"], title: "Continents", body: "By the most common convention there are **7 continents**: Africa, Antarctica, Asia, Europe, North America, South America and Oceania/Australia. Asia is the largest by area and population; Antarctica is the coldest, driest and windiest." },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function lookupKnowledge(query: string): KBEntry | null {
  const q = " " + norm(query) + " ";
  let best: KBEntry | null = null;
  let bestScore = 0;
  for (const entry of KNOWLEDGE) {
    for (const key of entry.keys) {
      const k = norm(key);
      if (!k) continue;
      if (q.includes(" " + k) || q.includes(k)) {
        const score = k.length;
        if (score > bestScore) { bestScore = score; best = entry; }
      }
    }
  }
  return best;
}
