// Source: latest FAQ doc supplied by Peter (replaces the July 13, 2026 Zoom
// demo version). Categorized per the source doc's own section headings.
export type FAQCategory = 'General' | 'Product & Features' | 'Technical & Installation' | 'Financial & Pricing';

export interface FAQEntry {
  id: string;
  category: FAQCategory;
  question: string;
  answer: string;
}

export const FAQ_ENTRIES: FAQEntry[] = [
  // ── General ──────────────────────────────────────────────────────────
  {
    id: 'what-is-yullr',
    category: 'General',
    question: 'What exactly is Yullr?',
    answer: 'Yullr ("yoo-ler") is an AI-powered video platform for ski racing and mountain sports. It uses patented AI detection and tracking technology to automatically identify racers on the course, stitch together multi-camera footage, and deliver professional-quality run videos to skiers, coaches, and families within minutes. The platform is currently fully operational at ski areas across New England and is expanding nationwide through exclusive partnerships with NASTAR and Live Timing, turning every race run into an instant, shareable highlight.',
  },
  {
    id: 'how-does-yullr-work',
    category: 'General',
    question: 'How does Yullr work?',
    answer: 'Yullr works by installing a network of fixed, PoE-powered cameras along the ski trail — typically around 5 per trail, covering the start, middle, and finish — that automatically detect and track each racer as they come down the course.',
  },
  {
    id: 'what-are-yullr-videos',
    category: 'General',
    question: 'What are Yullr videos?',
    answer: 'Video footage from all the cameras is automatically stitched together into one continuous top-to-bottom video and processed by an on-site server, which uploads the finished clips to the cloud. Within minutes, each athlete gets their own individually tagged, professional-quality run video, viewable on any phone or device.',
  },
  {
    id: 'why-is-yullr-needed',
    category: 'General',
    question: 'Why is Yullr needed?',
    answer: 'Athletes can\'t see themselves ski; video analysis has always been a cumbersome yet essential tool to enable athletes to connect what they felt in the run to what actually happened. Yullr unencumbers video capture by automating the filming, organizing, and sharing of video, so coaches can spend more time coaching and athletes can develop faster.',
  },
  {
    id: 'core-problem-for-coaches',
    category: 'General',
    question: 'What core problem is Yullr actually solving for coaches?',
    answer: 'Yullr gives coaches their time back. Filming, downloading, organizing, and distributing video is a significant administrative burden across youth sports; automating that lets coaches spend more of their time actually coaching instead of managing footage.',
  },
  {
    id: 'replace-the-coach',
    category: 'General',
    question: 'Is Yullr meant to replace the coach?',
    answer: 'Absolutely not! Video is meant to amplify coaching, not replace it. The technology supports the athlete-to-coach feedback loop rather than substituting for expert instruction.',
  },

  // ── Product & Features ───────────────────────────────────────────────
  {
    id: 'training-features',
    category: 'Product & Features',
    question: 'In addition to viewing videos, does Yullr include features to help coaches & athletes with training?',
    answer: 'Yes — the platform includes tools to help coaches and athletes analyze skiing technique at a glance, including: real-vs-ideal line visualization for every run, run-to-run comparisons with video overlay, slow-motion playback, dynamic zoom (follows from skier top to bottom), and both race and training run timing with customizable splits. Yullr also includes a commenting section for each video which allows coaches and athletes to post feedback, analysis and suggestions.',
  },
  {
    id: 'comment-permissions',
    category: 'Product & Features',
    question: 'Can you put permissions on the comments section (e.g., coaches only)?',
    answer: "Yes. Commenting access is fully customizable based on the program's needs. A team can choose to limit feedback to coach-only observations, allow for athlete interaction, or maintain a completely open forum for the group.",
  },
  {
    id: 'works-for-drills',
    category: 'Product & Features',
    question: 'Does the system work when running drills?',
    answer: 'Yes — Yullr is designed for training runs and technical drills just as much as race day. The entire suite of auto-detection, athlete tagging, and deep analysis features — including line visualization, turn tracking, and biomechanical reporting — functions during free-skiing and drill blocks, providing coaches and athletes with an immediate feedback loop throughout the entire session.',
  },
  {
    id: 'body-position-analysis',
    category: 'Product & Features',
    question: 'Can Yullr perform body position and movement analysis?',
    answer: 'Yes — Yullr includes biomechanics detection that extracts body positioning data from race and training footage to generate AI-powered coaching reports.',
  },
  {
    id: 'turn-analysis',
    category: 'Product & Features',
    question: 'Can Yullr perform turn analysis?',
    answer: "Yes — Yullr measures a skier's edge angle and tracks it across turn phases, including how quickly they reach peak edge angle, how long they hold it, and when they release it.",
  },
  {
    id: 'multi-course-same-run',
    category: 'Product & Features',
    question: 'What happens if there are multiple courses on the same run?',
    answer: "Yullr automatically identifies and captures each one independently. The system has handled up to six lanes at once (e.g., at Waterville Valley's High Country), including different disciplines like GS and slalom running simultaneously, and even top/bottom course splits which are all auto-identified.",
  },
  {
    id: 'software-stitch',
    category: 'Product & Features',
    question: 'Will the software "stitch" the entire run together?',
    answer: 'Yes. The software automatically stitches footage from multiple cameras into one continuous top-to-bottom video of the run, and users can also view the individual wide-shot camera feeds.',
  },
  {
    id: 'video-retention',
    category: 'Product & Features',
    question: 'How long are the videos held for/available to access?',
    answer: 'Raw footage is stored for 3–14 days, depending on the number of cameras in an install. Processed videos on yullr.com are kept forever.',
  },
  {
    id: 'how-skiers-see-videos',
    category: 'Product & Features',
    question: 'How can skiers see the videos?',
    answer: 'Each athlete gets their own individually tagged run video within minutes of finishing, viewable directly through the app/platform in an interface similar to YouTube, without needing any special hardware.',
  },
  {
    id: 'phone-for-athletes',
    category: 'Product & Features',
    question: 'What type of phone is needed for athletes to view footage?',
    answer: "The platform is fully mobile-adaptive — it works on both Android and iOS, and athletes can view their footage on any device, as long as there's internet access or cell coverage on the hill.",
  },
  {
    id: 'athlete-id-tagging',
    category: 'Product & Features',
    question: 'Is the system able to identify and tag different athletes during training?',
    answer: 'Yes, in two ways: Athletes self-tag by watching their clip in sequence and confirming "that\'s me," which also shows coaches who engaged with their footage. A coach can manually tag athletes using the app on a phone or tablet. Yullr is also developing a helmet-mounted NFC sticker (tapped via a mobile app) for real-time tagging, since many teams don\'t allow athletes to carry phones on the hill, plus a GPS-based mobile app for identification.',
  },
  {
    id: 'free-skiers-sticker',
    category: 'Product & Features',
    question: 'Would all free skiers need the helmet sticker?',
    answer: "No. Free/social skiers don't need a sticker — they can be identified via a mobile app if carrying a phone. The sticker/NFC solution exists specifically because many race teams don't allow athletes to carry phones on the hill during training or competition.",
  },
  {
    id: 'timing-integrations',
    category: 'Product & Features',
    question: 'What timing systems do you currently integrate with, and how do you set up the integration?',
    answer: "Yullr is currently operationally integrated with Vola and Split Second/Live-Timing (Nastar, Club, FIS applications). We are also updating our integration with Brower timing but this is not yet fully implemented. The integration is set up during the initial installation. Yullr's video platform also provides a stand alone timing feature which can be used for training runs.",
  },

  // ── Technical & Installation ─────────────────────────────────────────
  {
    id: 'installation-basics',
    category: 'Technical & Installation',
    question: 'What are the basics of a Yullr installation?',
    answer: "The integration is straightforward. Yullr provides and installs an onsite server (a standard PC tower), typically located in the finish building or another location close to the primary camera network, along with Yullr's own PoE (Power over Ethernet) switch, which powers all cameras and keeps Yullr traffic isolated from the mountain's operational network.",
  },
  {
    id: 'what-is-poe',
    category: 'Technical & Installation',
    question: 'What is PoE?',
    answer: "PoE (Power over Ethernet) lets one cable carry both power and data to each camera, so there's no separate electrical wiring needed — just a single cable run (up to 1,000 feet) from Yullr's switch to each camera. That's a big reason installs are fast and simple.",
  },
  {
    id: 'network-requirements',
    category: 'Technical & Installation',
    question: 'What are the internet & network requirements for a Yullr installation?',
    answer: "The only requirement from the mountain is a single available Ethernet connection with internet access, used solely to upload completed videos and system data to the cloud — the system generates very little outbound traffic and consumes virtually no inbound bandwidth.",
  },
  {
    id: 'power-requirements',
    category: 'Technical & Installation',
    question: 'What are the power requirements for a Yullr installation?',
    answer: "All cameras are powered directly from Yullr's PoE switch: where network connectivity already exists at a camera location, Yullr connects into it; where it doesn't (farther up the mountain), Yullr typically deploys a point-to-point wireless bridge (provided as part of the install), requiring only standard 120V power within roughly 300–500 feet of the camera location.",
  },
  {
    id: 'camera-type',
    category: 'Technical & Installation',
    question: 'What type of camera is needed?',
    answer: 'Yullr provides the cameras itself (part of the hardware solution). They are PoE-powered (not battery, except for remote sites) and are 3K-capable cameras currently outputting 1080p HD footage, with 3K resolution planned for a future unlock.',
  },
  {
    id: 'harsh-conditions',
    category: 'Technical & Installation',
    question: 'How do the cameras hold up in harsh mountain conditions?',
    answer: 'The cameras are ruggedized for the elements, rated to -40°C with built-in heaters to melt off snow buildup, and they auto-adjust for low light so they work day or night.',
  },
  {
    id: 'multi-camera-start-finish',
    category: 'Technical & Installation',
    question: 'Can you have multiple cameras to get start and finish?',
    answer: 'Yes. A typical setup includes a camera near the top, one in the middle, and one at the bottom. The smallest Northeast installation has 3 cameras; the largest has 22 across two trails. Long courses with blind corners or knolls have used up to 8 cameras.',
  },
  {
    id: 'cameras-per-trail',
    category: 'Technical & Installation',
    question: 'How many cameras are ideally/usually installed per trail?',
    answer: '3-5 per trail is ideal. Smaller trails or beginner areas can be covered with fewer. A typical capture zone is a maximum of 500 feet of vertical.',
  },
  {
    id: 'rear-facing-cameras',
    category: 'Technical & Installation',
    question: 'Do you have or use rear-facing cameras?',
    answer: 'Yes, racers can be captured from behind as some trail installations require a camera facing down the hill instead of facing up to get the best view in certain terrain conditions.',
  },
  {
    id: 'battery-temperature',
    category: 'Technical & Installation',
    question: 'Is it a battery-operated camera? Is it temperature dependent?',
    answer: "No, the cameras are not battery operated — they're powered via PoE (power over Ethernet) and draw very little wattage. A battery-powered option exists only for extremely remote locations. Temperature is not an issue: cameras are rated to -40°C and have operated at elevations from 4,000 ft (Northeast) to 11,000–12,000 ft (out West).",
  },
  {
    id: 'snowmaking-moisture',
    category: 'Technical & Installation',
    question: 'Any camera issues with moisture from snowmaking?',
    answer: 'No issues. The cameras have an internal heater that melts off any snow buildup, and the lens can rotate away at certain times to avoid direct exposure. One camera is even mounted on a snowmaking gun pedestal and has held up despite getting battered early in the season.',
  },
  {
    id: 'night-lighting',
    category: 'Technical & Installation',
    question: 'Can the cameras adjust for poor lighting at night?',
    answer: 'Yes, cameras auto-adjust for lighting conditions, and night can actually work better than daytime due to controlled lighting. Yullr is also partnering with NVIDIA\'s Inception program on AI-based video enhancement (e.g., digitally "defogging" foggy footage or reducing snow clutter).',
  },
  {
    id: 'hardwired-or-wireless',
    category: 'Technical & Installation',
    question: 'Are the cameras hardwired to the hill or wireless?',
    answer: "Both! Most cameras are wired via CAT6 to provide PoE (power over Ethernet); that same wire can plug into a switch to connect to a network and send data/video — typically up to a 300' distance, extendable to 1000'. A camera can also plug into a wireless link instead if the hardwire option is not possible.",
  },
  {
    id: 'poe-distance',
    category: 'Technical & Installation',
    question: 'What distance can a PoE run be?',
    answer: "The maximum PoE run is about 1,000 feet, using a specialty-rated Cat6 cable on a 10 Mbps (not gigabit) connection — technically longer than the standard 300 ft PoE limit because of the lower bandwidth requirement. Where there's no connectivity on the hill, Yullr provides a wireless link at no extra cost to relay the connection.",
  },
  {
    id: 'server-room-temp',
    category: 'Technical & Installation',
    question: 'Does the "server room" need to be kept at a certain temperature range?',
    answer: 'No. The system includes substantial cooling and fans. Servers have run fine in an un-air-conditioned office (around 98°F) and in a cool timing-building closet — winter conditions are actually beneficial due to heat generated by the computers/GPUs.',
  },
  {
    id: 'install-duration',
    category: 'Technical & Installation',
    question: 'How long does a typical install take to complete?',
    answer: '1–2 days, depending on the number of cameras and the availability of power, internet, etc.',
  },
  {
    id: 'self-install',
    category: 'Technical & Installation',
    question: 'Can a resort/hill choose to self-install?',
    answer: 'Yes — self-installing can result in a discounted rate.',
  },
  {
    id: 'ongoing-maintenance',
    category: 'Technical & Installation',
    question: 'How much maintenance/management do we need for the platform throughout the season?',
    answer: "Very little. Yullr owns, monitors, and updates the system remotely throughout the season. Coaches and mountain staff aren't expected to handle day-to-day upkeep, and if hardware fails, that's Yullr's responsibility to repair or replace.",
  },
  {
    id: 'who-maintains-system',
    category: 'Technical & Installation',
    question: 'Who is responsible for maintaining the Yullr system?',
    answer: 'Yullr supplies and manages all hardware, networking equipment, and software, and the system operates independently once installed — it can be monitored and updated remotely, requiring very little ongoing involvement from the mountain or coaching staff.',
  },
  {
    id: 'tech-support',
    category: 'Technical & Installation',
    question: 'What kind of tech support is offered?',
    answer: 'Effectively 24/7 - Support tiers and responsiveness levels are part of the team agreement, with instant response on many issues. The platform was also re-engineered to be simpler to use overall, and a full on-line support library of guides and how to videos are currently being rolled-out.',
  },

  // ── Financial & Pricing ──────────────────────────────────────────────
  {
    id: 'equipment-ownership',
    category: 'Financial & Pricing',
    question: 'Who owns the equipment — is it leased or through the subscription service?',
    answer: "Yullr owns the equipment. This way, if anything breaks, it's Yullr's responsibility to repair or replace it.",
  },
  {
    id: 'subscriptions-per-athlete',
    category: 'Financial & Pricing',
    question: 'Are subscriptions per athlete? Does the athlete or the team buy them?',
    answer: 'Subscriptions are per athlete. Teams can purchase them in bulk (which unlocks a 50% discount), or individual athletes — including visiting athletes, adult beer leagues, or race leagues — can purchase their own.',
  },
  {
    id: 'install-and-team-pricing',
    category: 'Financial & Pricing',
    question: 'What does Yullr cost to install and is there team pricing for subscriptions?',
    answer: 'Hardware installation is usually $1,000 per camera (license fee, includes install, wiring, and wireless gear) plus a one-time $3,000 integration fee — roughly $5,000–$6,000 all-in for a basic single-mountain setup. Regular subscription tiers and prices are as follows: Day Pass - $20 (for visiting or one-time athletes); Mountain Pass - $150 (athletes get full year of access for a single mountain); Season Pass - $200 (athletes get access to the entire Yullr network of mountains). Team and Club discounted subscription tiers and prices are as follows: Mountain Pass - $75 (athletes get full year of access for a single mountain); Season Pass - $100 (athletes get access to the entire Yullr network of mountains). Additionally, the first year after installation, athlete and coach subscriptions are provided at a 50% reduction off the regular team-discounted cost which comes to only $50 per user.',
  },
  {
    id: 'coach-only-subscription',
    category: 'Financial & Pricing',
    question: 'Can a team purchase a subscription for a coach to view all athletes, or does each athlete need their own subscription?',
    answer: 'A team can purchase subscriptions so coaches can view athletes. Each athlete still needs at least a free account/login (to enable tagging and limited video access), even if the team is covering the paid subscription.',
  },
  {
    id: 'fee-locked-in',
    category: 'Financial & Pricing',
    question: "Is a team's/athlete's subscription fee locked in, or what increase should be expected over time?",
    answer: "Subscriptions can be locked in via agreement. The company's stated goal is to hold steady or lower race-team pricing over time, not raise it — future revenue growth is expected to come more from the broader recreational/social skier market, which would help subsidize (not increase) race-program costs.",
  },
  {
    id: 'financial-benefit-for-mountain',
    category: 'Financial & Pricing',
    question: 'Is there a financial benefit if we install Yullr?',
    answer: 'Yullr shares 15% of its subscription revenue with ski club or ski area partners, giving race programs and resorts a new, passive income stream from video content generated on their mountain — at zero cost or effort to them. This built-in incentive also drives cross-promotion, since resorts are motivated to offer Yullr subscriptions at the point of lift-ticket and season-pass sales, boosting adoption for both sides.',
  },
  {
    id: 'revenue-share-attribution',
    category: 'Financial & Pricing',
    question: 'How does the 15% revenue share attribution work?',
    answer: 'The 15% revenue share applies to all transactions that can be attributed back to the hill/program, tracked in three ways: QR code traffic — subscriptions or purchases originating from QR codes displayed on Yullr\'s live feeds, including guests watching from the lodge, bar, at home, or anywhere else. Affiliate links — unique links provided to the hill/program for promoting Yullr to race teams, visiting athletes, schools, camps, or other guests. Mountain affiliation — if a user creates a Yullr account and associates themselves with the hill/program (or an affiliated program), that revenue is attributed back to the resort as well. As the platform expands into areas like ski instruction and terrain parks, Yullr also offers an open API for integration with third-party POS systems, creating further opportunities for attribution and guest engagement.',
  },
  {
    id: 'team-100-150-cost',
    category: 'Financial & Pricing',
    question: 'For a team of 100–150 athletes, what would the all-in cost look like?',
    answer: "For 100 athletes at the discounted $50/athlete first season rate, that's about $5,000/year in subscriptions, plus the one-time $5,000–$6,000 hardware/install cost. Phased payment options are being introduced so the upfront hardware cost doesn't have to be paid all at once.",
  },
  {
    id: 'install-cost-split',
    category: 'Financial & Pricing',
    question: 'How is installation cost typically split between race academies and hill operations?',
    answer: "It varies by site — sometimes the resort pays (for lodge simulcast and guest engagement value), sometimes it's split evenly with the team, sometimes the team covers it entirely to keep all the revenue share.",
  },
];
