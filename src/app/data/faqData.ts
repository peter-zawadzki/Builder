// Source: Q&A from the July 13, 2026 Zoom demo (chat + spoken transcript),
// "Yullr — FAQ (For Clubs, Coaches and Customers)". Categorized into
// General / Technical / Financial per the source doc's own grouping intent.
export type FAQCategory = 'General' | 'Technical' | 'Financial';

export interface FAQEntry {
  id: string;
  category: FAQCategory;
  question: string;
  answer: string;
}

export const FAQ_ENTRIES: FAQEntry[] = [
  {
    id: 'multi-course-same-run',
    category: 'General',
    question: 'What happens if there are multiple courses on the same run?',
    answer: "Yullr automatically identifies and captures each one independently. The system has handled up to six lanes at once (e.g., at Waterville Valley's High Country), including different disciplines like GS and slalom running simultaneously, and even top/bottom course splits — all auto-identified.",
  },
  {
    id: 'phone-for-athletes',
    category: 'General',
    question: 'What type of phone is needed for athletes to view footage?',
    answer: "The platform is fully mobile-adaptive — it works on both Android and iOS, and athletes can view their footage on any device, as long as there's internet access on the hill.",
  },
  {
    id: 'multi-camera-start-finish',
    category: 'General',
    question: 'Can you have multiple cameras to get start and finish?',
    answer: 'Yes. A typical setup includes a camera near the top, one in the middle, and one at the bottom. The smallest Northeast installation has 3 cameras; the largest has 22 across two trails. Long courses with blind corners or knolls have used up to 8 cameras.',
  },
  {
    id: 'software-stitch',
    category: 'General',
    question: 'Will the software "stitch" the entire run together?',
    answer: 'Yes. The software automatically stitches footage from multiple cameras into one continuous top-to-bottom video of the run, and users can also view the individual wide-shot camera feeds.',
  },
  {
    id: 'athlete-id-tagging',
    category: 'General',
    question: 'Is the system able to ID/tag different athletes during training?',
    answer: 'Yes, in two ways: (1) athletes self-tag by watching their clip in sequence and confirming "that\'s me," which also shows coaches who engaged with their footage; or (2) a coach can manually tag athletes. Yullr is also developing a helmet-mounted NFC sticker (tapped via a mobile app) for real-time tagging, since many teams don\'t allow athletes to carry phones on the hill, plus a GPS-based mobile app for identification.',
  },
  {
    id: 'equipment-ownership',
    category: 'General',
    question: 'Who owns the equipment — is it lease or through the subscription service?',
    answer: "Yullr owns the equipment. This way, if anything breaks, it's Yullr's responsibility to repair or replace it.",
  },
  {
    id: 'free-skiers-sticker',
    category: 'General',
    question: 'Would all free skiers need the helmet sticker?',
    answer: "No. Free/social skiers don't need a sticker — they can be identified via a mobile app if carrying a phone. The sticker/NFC solution exists specifically because many race teams don't allow athletes to carry phones on the hill during training or competition.",
  },
  {
    id: 'install-duration',
    category: 'General',
    question: 'How long does a typical install take to complete?',
    answer: '1–2 days, depending on the number of cameras and the availability of power, internet, etc.',
  },
  {
    id: 'self-install',
    category: 'General',
    question: 'Can a resort/hill choose to self-install?',
    answer: 'Yes — self-installing can result in a discounted rate, typically a $2,000 savings, but the installation requirements must fall under a specific scenario that will be determined at the site inspection.',
  },
  {
    id: 'install-cost-split',
    category: 'General',
    question: 'How is installation cost typically split between race academies and hill operations?',
    answer: "It varies by site — sometimes the resort pays (for lodge simulcast and guest engagement value), sometimes it's split evenly with the team, sometimes the team covers it entirely to keep all the revenue share, and in at least one case a parent covered the full cost.",
  },
  {
    id: 'tech-support',
    category: 'General',
    question: 'What kind of tech support is offered?',
    answer: 'Effectively 24/7 — described by Peter as "I don\'t sleep." Support tiers and responsiveness levels are part of the team agreement, with instant response on many issues. The platform was also re-engineered to be simpler to use overall.',
  },
  {
    id: 'camera-type',
    category: 'Technical',
    question: 'What type of camera is needed?',
    answer: 'Yullr provides the cameras itself (part of the hardware solution). They are PoE-powered (not battery, except for remote sites), rated to -40°C, and are 3K-capable cameras currently outputting 1080p footage, with 3K resolution planned for a future unlock.',
  },
  {
    id: 'battery-temperature',
    category: 'Technical',
    question: 'Is it a battery-operated camera? Is it temperature dependent?',
    answer: "No, the cameras are not battery operated — they're powered via PoE (power over Ethernet) and draw very little wattage. A battery-powered option exists only for extremely remote locations. Temperature is not an issue: cameras are rated to -40°C and have operated at elevations from 4,000 ft (Northeast) to 11,000–12,000 ft (out West).",
  },
  {
    id: 'snowmaking-moisture',
    category: 'Technical',
    question: 'Any camera issues with moisture from snowmaking?',
    answer: 'No issues. The cameras have an internal heater that melts off any snow buildup, and the lens can rotate away at certain times to avoid direct exposure. One camera is even mounted on a snowmaking gun pedestal and has held up despite getting battered early in the season.',
  },
  {
    id: 'server-room-temp',
    category: 'Technical',
    question: 'Does the "server room" need to be kept at a certain temperature range?',
    answer: 'No. The system includes substantial cooling and fans. Servers have run fine in an un-air-conditioned office (around 98°F) and in a cool timing-building closet — winter conditions are actually beneficial due to heat generated by the computers/GPUs.',
  },
  {
    id: 'poe-distance',
    category: 'Technical',
    question: 'What distance can a PoE (Power over Ethernet) run be?',
    answer: 'The maximum PoE run is about 1,000 feet, using a specialty-rated Cat6 cable on a 10 Mbps (not gigabit) connection — technically longer than the standard 300 ft PoE limit because of the lower bandwidth requirement. Where there\'s no connectivity on the hill, Yullr provides a wireless link at no extra cost to relay the connection.',
  },
  {
    id: 'night-lighting',
    category: 'Technical',
    question: 'Can the cameras adjust for poor lighting at night?',
    answer: 'Yes, cameras auto-adjust for lighting conditions, and night can actually work better than daytime due to controlled lighting. Yullr is also partnering with NVIDIA\'s Inception program on AI-based video enhancement (e.g., digitally "defogging" foggy footage or reducing snow clutter).',
  },
  {
    id: 'subscriptions-per-athlete',
    category: 'Financial',
    question: 'Are subscriptions per athlete? Does the athlete or the team buy them?',
    answer: "Subscriptions are per athlete. Teams can purchase them in bulk (which unlocks a 50% discount), alternatively individual athletes — including visiting athletes, adult beer leagues, or race leagues — can purchase their own via Yullr.com. For host mountain clubs and programs, for the first year to encourage adoption, subscriptions for the club's direct users will be just $50. After the first year this cost goes to $100.",
  },
  {
    id: 'pricing-tiers',
    category: 'Financial',
    question: 'Can you go over the pricing tiers and team pricing?',
    answer: 'Hardware/installation: ~$1,000 per camera (license fee, includes install, wiring, and wireless gear) plus a one-time $3,000 integration fee — roughly $5,000–$6,000 all-in for a basic single-mountain setup. Subscription tiers (full price / team-discounted): Day Pass: $20/day (visiting or one-time athletes). Mountain Pass: $150 / $75 per athlete per season (one mountain). Season Pass: $200 / $100 per athlete per season (access to the entire Yullr network of mountains).',
  },
  {
    id: 'coach-only-subscription',
    category: 'Financial',
    question: 'Can a team purchase a subscription for a coach to view all athletes, or does each athlete need their own subscription?',
    answer: 'A team can purchase subscriptions so coaches can view athletes. Each athlete still needs at least a free account/login (to enable tagging and limited video access), even if the team is covering the paid subscription.',
  },
  {
    id: 'fee-locked-in',
    category: 'Financial',
    question: "Is a team's/athlete's subscription fee locked in, or what increase should be expected over time?",
    answer: "Subscriptions can be locked in via agreement. The company's stated goal is to hold steady or lower race-team pricing over time, not raise it — future revenue growth is expected to come more from the broader recreational/social skier market, which would help subsidize (not increase) race-program costs.",
  },
  {
    id: 'team-100-150-cost',
    category: 'Financial',
    question: 'For a team of 100–150 athletes, what would the all-in cost look like?',
    answer: "For 100 athletes at the discounted $100/athlete season rate, that's about $10,000/year in subscriptions, plus the one-time $5,000–$6,000 hardware/install cost. Phased payment options are being introduced so the upfront hardware cost doesn't have to be paid all at once.",
  },
];
