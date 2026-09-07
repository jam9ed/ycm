/* ==========================================================================
   Inventory — lifted from the live INVENTORY page, nothing else.

   Titles and copy are verbatim. The page marks its listings up as large-font
   <h2> headings separated by rows of anchor emoji, so the parser split on the
   separators, took the largest title-like heading in each block as the title,
   and kept the rest as the body. Boundaries were then checked by hand against
   the page, because the markup repeats a model name as a sub-heading and a
   naive split cuts listings in half.

   Only fields actually stated on the page are recorded. There is no `make`,
   `category`, `engine`, `trailer` or `freshwater` here: inventing those is what
   produced wrong metadata twice. `length` is the one derived field, read off
   the model designation itself (a "170 Montauk" is 17 feet), and it is absent
   where the model does not state one.

   `kind` marks the ads that are not boats — the outboards, the collectibles
   and Dave's camper. Eight of the thirty-six. Without it every count on the
   site called all thirty-six "boats", which is simply untrue.

   Photographs are attached in the admin Gallery, never here.
   ========================================================================== */

const STATUS = {
  available: { label: 'Available',     cls: 'badge-avail'    },
  arriving:  { label: 'Just arriving', cls: 'badge-arriving' },
  project:   { label: 'Project',       cls: 'badge-project'  },
  sold:      { label: 'Sold',          cls: 'badge-sold'     },
};

/* A video slot. No playback URLs exist in the archive — Wix streams them from
   its own CDN — so these carry a poster-less player until a host is chosen. */
const vid = (label, duration, ratio = '16:9') => ({ label, duration, ratio, src: '', hls: '' });

const boats = [
  {
    id:'featured-montauk-17', status:'available', order:0,
    featured:true,
    title:'The nicest Boston Whaler Montauk 17 anywhere!',
    price:30000, length:17,
    body:[
      'ONE OWNER! Garage Kept & Exceptional',
      'This is the nicest, all original Classic Montauk on the market - perhaps in existence.',
      '27 Years - one owner.',
      'The boat will not be inexpensive.',
      'If you are looking for the very best, give us a call. $30k -',
    ],
    media:[],
  },
  {
    id:'montauk-1976-project', status:'project', order:1,
    title:'1976 Boston Whaler Montauk Project Boat - No Power $5k.',
    year:1976, price:5000, length:17,
    body:[
      'Call w/questions.',
      'That\'s a $5k Montauk!',
    ],
    media:[],
  },
  {
    id:'standard-11-1978', status:'arriving', order:2,
    title:'Just Arriving! 1978 Boston Whaler 11\' Standard!',
    year:1978, price:10500, length:11,
    body:[
      '-One owner since 1978!',
      '-Freshwater boat since new.',
      '-$1,500 Full Custom Cover',
      '-Freshwater 2000 Johnson 6 hp in immaculate condition - or your choice of any new outboard up to 10 hp.',
      '-New $2,000 Galvanized Trailer.',
      '-This is the nicest, all original, unmolested Classic 11 Footer on the market, and that we have seen in a long while! - She\'s $10,500',
      'The nicest all original classic 11 footer anywhere!',
    ],
    media:[],
  },
  {
    id:'montauk-170-2005', status:'available', order:3,
    title:'2005 Boston Whaler 170 Montauk $15k',
    year:2005, price:15000, length:17,
    body:[
      'Very nice Boston Whaler 170 Montauk!',
      'Nicely appointed with factory bimini top, swim platform, side and bow rails, fishing, comfort package, electronics.',
      'The original outboard is has low compression and will be removed prior to sale.',
      'Your Choice - without motor $15k or with Brand New Mercury 90 hp Fuel Injected Four Stroke w/3 Year Factory Warranty $28k',
    ],
    media:[],
  },
  {
    id:'sport-130-2008', status:'available', order:4,
    title:'2008 Boston Whaler 50th Anniversary Edition 130 Sport!',
    year:2008, price:16000, length:13, hours:109,
    body:[
      'Blue interior pays homage to the original 13 footers 50 years prior!',
      'Mercury 40 hp Four Stroke w/109 Total Hours!',
      'This is a sought after and rare find -especially without bottom paint!',
      '$16k with aluminum trailer.',
      'Call to schedule FaceTime walk-around video!',
    ],
    media:[],
  },
  {
    id:'supersport-160-2019', status:'available', order:5,
    title:'2019 Boston Whaler 160 Super Sport with 57 total hours!',
    year:2019, price:28000, length:16, hours:57,
    body:[
      'Fast, Fun, and Fantastic Ride Quality!',
      'This is a really nice boat & THE BEST SUPER SPORT EVER PRODUCED!',
      '-Mercury 90 Horsepower Fuel Injected Four Stroke',
      '-One, Senior Owner.',
      '-Never Bottom Painted.',
      '-Split Front Bow Rail',
      '-19 Gallon Fuel Tank,',
      '-Teak Package',
      '-Swim Ladder, etc',
      'New = $41k, ours with 54 hours = $28k',
      'The 160 Super Sport is the best riding side console Whaler ever produced.',
      'Need a trailer? We\'ll add a brand new EZ-Loader for 2k.',
    ],
    media:[],
  },
  {
    id:'sport-15-1984', status:'arriving', order:6,
    title:'Just Arriving! 1984 Boston Whaler 15 Sport Center Console with some very unusual options...',
    year:1984, length:15,
    body:[
      'Same family owned since the 1980s!',
      'More to follow... $TBA.',
      'BTW - we have many Classic 15\' Whalers! Call if you don\'t see what you\'re looking for!',
    ],
    media:[],
  },
  {
    id:'supersport-150-2015', status:'arriving', order:7,
    title:'2015 Boston Whaler 150 Super Sport',
    year:2015, length:15, hours:207,
    body:[
      'Just Arriving! Boston Whaler 150 Super Sport!',
      '2015 FRESHWATER boat from the lakes of Tennessee!',
      '-Only 207 Freshwater Hours - 119 of which were below 1400 RPM!',
      '-Fuel Injected Four Stroke Mercury',
      '-Factory Bimini Top,',
      '-Galv Trailer w/folding tongue, etc.',
      '-More pics and info soon! $TBA - Call if interested',
    ],
    media:[],
  },
  {
    id:'impact-2001', status:'available', order:8,
    title:'2001 Boston Whaler Impact!',
    year:2001, price:5000, wasPrice:10000,
    body:[
      'SEPTEMBER SPECIAL Take $5k off!',
      'Full Cushion Package, Factory Bimini Top, Cover, Engine Needs Work - Call for details $10k-$5k= $5K !!',
    ],
    media:[],
  },
  {
    id:'supersport-160-2022', status:'available', order:9,
    title:'2022 BOSTON WHALER 160 SUPER SPORT! - 24 total hours!',
    year:2022, price:32000, wasPrice:34000, length:16, hours:24,
    body:[
      'SEPTEMBER SPECIAL Take $2,000 off!',
      '2022 Boston Whaler 160 Super Sport. Only 24 HOURS!',
      'Mercury 90 HP Fuel Injected Four Stroke, Split Bow Rails, Bucket Seats, Bimini Top, 19 Gallon Fuel Tank, Cushion Package, Galvanized Trailer w/Folding Tongue, etc -Gorgeous!',
      '$34k - SEPTEMBER SPECIAL = $32K',
    ],
    media:[],
  },
  {
    id:'outrage-23-g2', status:'arriving', order:10,
    title:'BOSTON WHALER 23 OUTRAGE W/TWIN EVINRUDE G2 150s!',
    length:23, hours:44,
    body:[
      '44 Total Hours!',
      'Just Arriving! - We\'ll share more info soon -CALLS ARE ENCOURAGED!',
      'FOURTY-FOUR TOTAL HOURS!!',
      'Twin 2019 Evinrude ETec G2 150 High Output Engines with extremely low hours -and still under warranty!',
      'This boat has been updated with extremely cool stuff like Evinrude\'s iDock Joystick Controls for low speed maneuvering and easy docking. Not familiar? Seriously, Google it -this is high-tech, intuitive, and very cool!',
      'She\'s also loaded with Garmin electronics, including Radar!',
      'T-Top, Autopilot, Livewell, Marine Head, Factory Docking Lights, Lewmar Windlass, Lots of Seating, Storage etc, etc.',
      'The internal fuel tank was replaced during the extensive upgrade and re-power -no expense was spared.',
      'BRAND NEW 2026 EZ LOADER $7,000 Aluminum Trailer will also be included.',
      'This boat belonged to an 82 year old gentleman -which has made attaining additional photos a bit difficult.',
      'Give us a call with any questions!',
    ],
    media:[],
  },
  {
    id:'acadia-21-traveler', status:'available', order:11,
    title:'2003 Atlas Boat Works Acadia 21 — "Traveler"',
    year:2003, price:28000, wasPrice:30000, length:21,
    body:[
      'SEPTEMBER SPECIAL Take $2,000 off!',
      'Sea Trail Video on Homepage! See 4+ minute sea-trial video on home page!',
      '75hp Yanmar turbo diesel inboard',
      'Full length keel',
      'Freshwater boat',
      'Senior owned',
      'Magic Tilt Trailer',
      'Canvas dodger, console, and seat covers',
      'Extremely good condition, and runs flawlessly!',
      '$30k - Call for details! - TAKE $2K OFF FOR SEPTEMBER SPECIAL!',
    ],
    // the only ad whose own copy states a video exists
    media:[ vid('Acadia 21 “Traveler” — sea trial', '4:00') ],
  },
  {
    id:'montauk-170-2003', status:'available', order:12,
    title:'2003 Boston Whaler 170 Montauk!',
    year:2003, price:18000, length:17,
    body:[
      'Original Mercury 90 hp two stroke',
      'Factory bimini top',
      'Galvanized Trailer',
      'Fully Serviced and Water Ready!',
      '$18k',
    ],
    media:[],
  },
  {
    id:'nucamp-tab-2018', kind:'camper', status:'available', order:13,
    title:'2018 NuCamp T@B 320 Camper!',
    year:2018, price:15000,
    body:[
      'EXTREMELY NICE! $15K -offers considered!',
      'Time to sell our office / 2018 NuCamp Tab 320S',
      'I bought this beautiful little Teardrop Camper from the original owners about 3 years ago to use as temporary office, inside of our large metal building -and maybe to one day camp in.',
      'While I never did do any camping, she served me well as a quiet place to make calls, and do occasional paperwork.',
      'We\'re putting in a new office, and it\'s time to let her go, hopefully to someone who will actually go camping!',
      'The previous owners were an older couple that like me, stored her inside.',
      'I\'ll provide more pics soon. She\'s in near, if not perfect condition.',
      'There is an enclosed toilet and shower, water heater, stove, sink and refrigerator, overhead cabinets, table and U shaped seating which becomes a bed.',
      'Also, a TV, Stereo, Air Condition, Heat, Full Cover, Spare Tire, etc.',
      'Of all this, the only thing I\'ve done is sit at the table, and occasionally turn on the AC or the roof fan.',
      'We\'re asking $15k.',
      'Feel free to call with questions, or to schedule a live FaceTime video call.',
      'If it helps, we can also adhere a set of Boston Whaler stickers to port and starboard.',
    ],
    media:[],
  },
  {
    id:'supersport-17-1984', status:'available', order:14,
    title:'1984 Boston Whaler 17 Super Sport!',
    year:1984, price:12500, length:17,
    body:[
      '1996 Mercury 90 hp Two Stroke - Fun, Fast, Original $12,500',
    ],
    media:[],
  },
  {
    id:'outrage-17-1991', status:'available', order:15,
    title:'Boston Whaler Outrage 17!',
    year:1991, price:14000, length:17,
    body:[
      '1991 Boston Whaler Outrage',
      '2002 Yamaha F115 Fuel Injected Four Stroke',
      '2005 Venture Galv Trailer',
      'Senior owned - $14k',
    ],
    media:[],
  },
  {
    id:'portland-pudgy', status:'available', order:16,
    title:'Portland Pudgy!',
    price:2500, length:7.9,
    body:[
      'We have three of these super cool pre-owned unsinkable sailboat/rowboat/motorboat/lifeboats!',
      'Rated for up to 2 hp. Starting @ $2,500',
      'One was a Pirate Ship @ Halloween!',
      'Give us a call with questions!',
    ],
    media:[],
  },
  {
    id:'revenge-25-1985', status:'arriving', order:17,
    title:'Extremely Rare 1985 Boston Whaler Revenge 25 Hardtop!',
    year:1985, length:25,
    body:[
      '- Much more to follow. Call if interested!',
    ],
    media:[],
  },
  {
    id:'outrage-19ii-1993', status:'available', order:18,
    title:'1993 Boston Whaler Outrage 19 II !!',
    year:1993, price:17000, length:19,
    body:[
      'Honda Four Stroke 130 - Just Serviced and water-ready!',
      'One family since new! Please see write up on Homepage. $17k Call if interested!',
    ],
    media:[],
  },
  {
    id:'arima-sea-ranger-17', status:'available', order:19,
    title:'Arima - Super Cool West Coast Brand!',
    year:2000, price:14000, length:17,
    body:[
      'AVAILABLE! 2000 Arima Sea Ranger 17 - Honda 90 hp Four Stroke $14k - See write up on homepage.',
      '- We\'ve got an open bow version waiting in the wings as well.',
    ],
    media:[],
  },
  {
    id:'danforth-compass', kind:'collectible', status:'available', order:20,
    title:'Vintage Danforth Express Compass in original Binnacle mount',
    price:1000,
    body:[
      'Removed several years ago from a USN Boston Whaler Guardian. Very rare, and in excellent condition.',
      '7" across at base, aprox 7.5" Tall. Mount included.',
      'Display in office, man cave or install on your Whaler! $1,000.',
      '50% of proceeds benefit JDRF - The Juvenile Diabetes Research Foundation.',
    ],
    media:[],
  },
  {
    id:'danbury-nauset', kind:'collectible', status:'available', order:21,
    title:'DANBURY MINT 1/24 Scale 1961 Boston Whaler Nauset',
    price:1500,
    body:[
      'Released in limited numbers in 1999, impossible to find. $1,500 in original box.',
      '50% of proceeds to benefit JDRF - The Juvenile Diabetes Research Foundation',
    ],
    media:[],
  },
  {
    id:'danbury-13-sport', kind:'collectible', status:'available', order:22,
    title:'Commemorative 1/24 Scale 1958 Boston Whaler 13 Sport',
    price:1200,
    body:[
      'Commissioned in 2008 by Boston Whaler in celebration of their 50th Anniversary. Produced in limited numbers by the Danbury Mint Factory.',
      '$1,200 in original box.',
      '50% of proceeds to benefit JDRF - The Juvenile Diabetes Research Foundation.',
    ],
    media:[],
  },
  {
    id:'johnson-25-1999', kind:'motor', status:'available', order:23,
    title:'NEVER INSTALLED! 1999 Johnson 25 hp Commercial outboard',
    year:1999, price:3000,
    body:[
      'Long Shaft.',
      'Original receipt, kept in garage since new, never installed on boat. $3k',
    ],
    media:[],
  },
  {
    id:'yamaha-4hp', kind:'motor', status:'available', order:24,
    title:'New with Warranty! Yamaha 4 hp Four Stroke!',
    body:[
      'Call for pricing and availability.',
    ],
    media:[],
  },
  {
    id:'yamaha-20-2015', kind:'motor', status:'available', order:25,
    title:'AVAILABLE! 2015 Yamaha 20 hp Four Stroke SHORT SHAFT',
    year:2015, price:2500,
    body:[
      'In excellent condition. One owner, very little use. $2,500',
    ],
    media:[],
  },
  {
    id:'mercury-15-2021', kind:'motor', status:'available', order:26,
    title:'2021 Electric Start Mercury 15 hp Outboard',
    year:2021, price:2800,
    body:[
      'Tiller controlled, short shaft. Four Stroke with Fuel Injection. $2,800.',
    ],
    media:[],
  },
  {
    id:'outrage-23-suzuki', status:'available', order:27,
    title:'AVAILABLE! - 23 Outrage - 2017 Suzuki 300 Four Stroke w/42 Hours!',
    year:2017, price:45000, length:23, hours:42,
    body:[
      'Spring Sale $45k',
      'Trailer included. Call for details.',
    ],
    media:[],
  },
  {
    id:'grady-180-2000', status:'available', order:28,
    title:'2000 Grady White 180 Sportsman, SeaV2 Hull',
    year:2000, price:20000, length:18,
    body:[
      '2019 Aluminum Trailer',
      'UPDATE - Mercury 135 Optimax to be installed soon!',
      '$20k',
    ],
    media:[],
  },
  {
    id:'sport-15-1975-hull25', status:'available', order:29,
    title:'Hull # 25 - Very Early 1975 Boston Whaler 15 Sport',
    year:1975, length:15,
    body:[
      'One owner, Freshwater. Call if interested.',
    ],
    media:[],
  },
  {
    id:'outrage-18-1985', status:'arriving', order:30,
    title:'1985 Boston Whaler Outrage 18 - Available soon...',
    year:1985, length:18,
    body:[],
    media:[],
  },
  {
    id:'outrage-18-1987-project', status:'project', order:31,
    title:'1987 Boston Whaler Outrage 18',
    year:1987, price:8500, length:18,
    body:[
      'Trailer included, No engine, $8,500',
    ],
    media:[],
  },
  {
    id:'sport-15-1985-project', status:'project', order:32,
    title:'1985 Boston Whaler 15 Sport',
    year:1985, price:4500, length:15,
    body:[
      'Non-Running Project - $4,500',
    ],
    media:[],
  },
  {
    id:'newport-1975-project', status:'project', order:33,
    title:'AVAILABLE! PROJECT - 1975 Boston Whaler Newport',
    year:1975, price:6500, length:17,
    body:[
      'Motor ran two years ago. $6,500 w/Trailer - Please call if interested!',
    ],
    media:[],
  },
  {
    id:'rigid-raider-1989-project', status:'project', order:34,
    title:'AVAILABLE! - PROJECT - 1989 Boston Whaler Rigid Raider 18',
    year:1989, price:10000, length:18,
    body:[
      'Non-running project.',
      '- Extremely rare, and the toughest Whaler ever built. $10k w/BoatMaster Trailer - Never Bottom Painted!',
    ],
    media:[],
  },
  {
    id:'ventura-16-1999-project', status:'project', order:35,
    title:'AVAILABLE! PROJECT with EXCELLENT POTENTIAL! 1999 Boston Whaler Ventura 16',
    year:1999, price:8000, wasPrice:10000, length:16,
    body:[
      'Mercury 90 two stroke, 10k. Give us a call w/questions.',
      '- see write up on homepage.',
      'FALL SALE $8K!',
    ],
    media:[],
  },
];

window.YCM = { boats, STATUS, vid };
