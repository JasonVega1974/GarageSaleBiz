/* ═══════════════════════════════════════════════════════════════════════════
   THE GARAGE SALE OPERATOR COURSE — content source

   Scaled down from EstateSaleBiz's eight-module curriculum to four modules and
   fourteen lessons, and rewritten for this trade rather than adapted. Garage and
   moving sales are a different job from estate liquidation: lower ticket values,
   a living client who is usually standing right there, weather that decides your
   weekend, and a deadline that is often a moving truck.

   CONTENT RULES, enforced at authoring time:
   • NO earnings claims, income projections, or "operators typically make…".
     Rates and percentages describe a PRICING STRUCTURE, never an outcome.
   • NO invented statistics. Where a number appears it is arithmetic the reader
     can check, or it is labelled as a rule of thumb rather than a finding.
   • Anything legal, tax, or insurance-related says to check locally, because it
     genuinely varies by city and none of it is advice.
   • Diagrams are inline SVG — no image files to lose, no CDN to depend on, and
     they scale and print cleanly.
   ═══════════════════════════════════════════════════════════════════════════ */

window.COURSE_META = {
  title: 'The Garage Sale Operator Course',
  tagline: 'How to find the work, price it, run it, and turn one job into the next.',
  moduleCount: 4,
  // No quiz gating, deliberately. EstateSaleBiz gated module completion on a
  // 4-of-5 quiz; here the reader is a paying adult with a driveway to clear, and
  // a gate between them and the next lesson buys nothing.
  quizzes: false
};

window.COURSE_MODULES = [

/* ═══════════════════ MODULE 1 ═══════════════════ */
{
  num: 1,
  icon: '🚪',
  title: 'Finding your first client',
  tagline: 'The offer, the five places the work comes from, the conversation that books it, and the rules in your own city.',
  minutes: 52,
  objectives: [
    'State your offer in two sentences a homeowner immediately understands.',
    'Name the five recurring sources of garage and moving sale work, and pick the two to start with.',
    'Run a first conversation that ends in a booked date rather than "let me think about it".',
    'Find out what your own city actually requires for permits and signs before your first sale.'
  ],
  lessons: [
    {
      title: "What you're actually selling",
      minutes: 12,
      html: `
        <h3>The problem you solve is not "selling things"</h3>
        <p>Almost nobody wants a garage sale. What they want is <strong>the garage back</strong>. The
        sale is the mechanism, and running it is the part they dread: the pricing decisions, the early
        start, the strangers in the driveway, the haggling, and the pile of unsold things at 4pm on
        Sunday that is somehow now their problem again.</p>
        <p>You are not selling a service called "garage sale organising". You are selling the removal
        of an entire weekend of unpleasant work, and a cheque at the end of it instead of a skip
        hire bill. That is a much easier thing to say yes to.</p>

        <h3>Your offer in two sentences</h3>
        <p>If you cannot say it in the time it takes someone to decide whether to keep listening, it
        is too complicated. Something close to this works:</p>
        <blockquote>"I run garage and moving sales for people who don't want to do it themselves. I
        price everything, put up the signs, work the whole sale, and hand you your share afterwards —
        you don't have to be there."</blockquote>
        <p>Notice what that sentence does. It names the job, lists the work you take away, and closes
        on the outcome. It does not mention your commission, your website, or your process. Those
        come up once they are interested, and not before.</p>

        <h3>"You don't have to be there" is the strongest thing you have</h3>
        <p>For a lot of clients this is the whole sale. Some people are actively embarrassed by a
        garage sale at their house. Some are grieving, or exhausted, or leaving town on Friday. Being
        able to say the sale happens whether or not they are present turns your service from
        "help with a chore" into "the chore is gone".</p>
        <p>It has a practical consequence you should plan for: if the client is not there, every
        decision on the day is yours. That is exactly why the written agreement matters, and why
        Section 4 of it — pricing authority — is not boilerplate.</p>

        <h3>What you are NOT offering</h3>
        <p>Being clear about this early prevents most of the disputes you would otherwise have:</p>
        <ul>
          <li><strong>You are not buying their things.</strong> You sell on their behalf and take a
          percentage. Their property stays theirs until a shopper pays for it.</li>
          <li><strong>You are not an appraiser.</strong> If something might be genuinely valuable —
          a signed painting, a firearm, jewellery that looks real, a vintage instrument — say so and
          tell them to get it looked at separately before the sale. Pricing it at $40 and having them
          later discover it was worth $4,000 is the single worst outcome in this trade.</li>
          <li><strong>You are not promising a total.</strong> Never estimate what a sale will make.
          You genuinely cannot know, and a number said out loud becomes a number you are held to.</li>
          <li><strong>You are not a haulage company</strong> unless you have agreed to be, in
          writing, for a fee.</li>
        </ul>

        <div class="crs-tip">
          <strong>Say this out loud ten times before your first conversation.</strong> Not to
          memorise a script — so that the words come out in the right order when someone asks what
          you do while you are holding a coffee and not expecting the question.
        </div>
      `
    },
    {
      title: 'The five places this work comes from',
      minutes: 14,
      html: `
        <h3>All of it is one of five situations</h3>
        <p>Every garage or moving sale job you will ever book traces back to one of these. Knowing
        which one you are looking at tells you what to say and how urgent it is.</p>

        <ol>
          <li><strong>Someone is moving.</strong> The most reliable source there is, because it comes
          with a deadline that is not negotiable. A moving truck is booked. Whatever has not sold by
          then is going in it, being given away, or being paid to be taken. Urgency does the selling
          for you.</li>
          <li><strong>Someone is downsizing.</strong> Older couple moving to something smaller, or
          into assisted living. Emotionally slower, often decided by an adult child, and frequently
          a bigger sale than it first looks.</li>
          <li><strong>Someone has inherited a house they don't live in.</strong> Usually out of town,
          usually short on time, usually wants the house empty so it can be sold. Often the highest
          value per hour of your work, because they are not attached to the contents. If it is a
          whole houseful of genuinely valuable antiques, that is estate liquidation and a different
          trade — know where your edge is.</li>
          <li><strong>A landlord or property manager has a unit to clear.</strong> Repeat business.
          One good relationship here can produce work indefinitely, because turnover never stops.</li>
          <li><strong>Someone has simply had enough of their garage.</strong> No deadline, no event,
          just years of accumulation. The hardest to convert because nothing is forcing it — but the
          easiest to find, and a fine place to get your first one under your belt.</li>
        </ol>

        <h3>Where to actually look, in the order that works</h3>
        <p>Start with the two that need no money and no permission:</p>
        <p><strong>1 — Sales already happening badly.</strong> On any Saturday morning, drive the
        neighbourhoods you have claimed. You will find sales with no signs beyond the driveway, four
        items on a card table, and someone sitting in a lawn chair looking defeated. These are
        people who have proven they are willing to have a sale and have discovered how much work it
        is. Talk to them at 2pm, not at 8am. Ask how it has gone. Listen. Then say your two
        sentences.</p>
        <p><strong>2 — Local groups and neighbourhood apps.</strong> People post "moving, everything
        must go" constantly, and most of them are about to do it badly. Do not spam the group with
        your services — most will remove you and you will burn the room. Reply helpfully to the
        specific person, in a comment or a direct message, and mention what you do once.</p>

        <p>Then the ones that need a conversation:</p>
        <p><strong>3 — Real estate agents.</strong> An agent with a listing full of furniture has a
        problem: the house shows badly and the seller is overwhelmed. You are the solution and it
        costs the agent nothing. Introduce yourself to the agents working your cities. Bring
        something physical — a card, a one-page sheet.</p>
        <p><strong>4 — Movers and cleaners.</strong> They are inside houses full of things people
        have decided not to keep, every single day, and they are asked "do you know anyone who…"
        constantly.</p>
        <p><strong>5 — Everyone who already knows you.</strong> Genuinely the most likely source of
        your first job. Tell people what you now do. Not a broadcast — individual, specific
        conversations. Your first client is very often somebody's mother.</p>

        <h3>Pick two and work them properly</h3>
        <p>Working all five badly is worse than working two well. For a first month, the Saturday
        drive-around plus the people who already know you will get you further than a scattered
        effort across all five, and both cost nothing but time.</p>

        <div class="crs-note">
          <strong>Write down every conversation.</strong> Put it in your client list the same day,
          with what they said and when to follow up. "Not until we've sorted the basement" in March
          is a booked job in June — but only if it is written somewhere you will actually look.
          Memory will not do this for you.
        </div>
      `
    },
    {
      title: 'The conversation that books the job',
      minutes: 14,
      html: `
        <h3>Your job in the first conversation is to be told the deadline</h3>
        <p>Not to describe your service, not to quote a rate. If you leave knowing when they need it
        done by, you have something to work with. If you leave having explained your commission
        structure in detail to someone with no date in mind, you have had a pleasant chat.</p>
        <p>So ask early: <em>"When do you need it gone by?"</em> The answer sorts everything. A date
        means a real job. "Eventually" means a follow-up in your client list.</p>

        <h3>Walk it before you say anything about money</h3>
        <p>Ask to see the space. You are looking for four things:</p>
        <ul>
          <li><strong>Volume.</strong> Roughly how many hours of sorting and pricing is this? A
          two-car garage packed to the door is a different job from a tidy one with a few shelves.</li>
          <li><strong>Anything genuinely valuable.</strong> Flag it out loud, immediately, and tell
          them to have it looked at separately. This one habit protects you more than anything else
          in this course.</li>
          <li><strong>Access and layout.</strong> Where do shoppers park? Is the driveway flat? Can
          you get a sofa out without going through the house?</li>
          <li><strong>What they are secretly not willing to sell.</strong> There is almost always
          something. Find it now, not on Saturday morning when they take it back off the table in
          front of a shopper.</li>
        </ul>

        <h3>Then be direct about the money</h3>
        <p>Do not be shy or vague here — hesitation reads as either dishonesty or inexperience. Say
        the number plainly:</p>
        <blockquote>"I work on commission. I take [your rate] of whatever the sale brings in, and you
        get the rest. There's nothing to pay upfront and nothing to pay if it doesn't sell — if I
        don't sell anything, I don't earn anything either."</blockquote>
        <p>That last clause does real work. It tells them your incentives point the same way as
        theirs, which is true and worth saying.</p>
        <p>If you use a minimum fee, say that in the same breath rather than letting them discover it
        in the agreement: <em>"There's a minimum of $X, because the work is the same whether the sale
        does well or not."</em> Most people find that entirely reasonable. Nobody finds it reasonable
        when it appears in writing after a handshake.</p>

        <h3>The three objections, and what is actually behind them</h3>
        <p><strong>"That seems like a lot."</strong> They are comparing your percentage to nothing,
        because doing it themselves feels free. It is not free — it is their whole weekend, and their
        sale will take less. Answer with the work, not the percentage: <em>"It covers pricing
        everything, all the advertising, the signs, working both days, and clearing up. You don't
        have to be there for any of it."</em></p>
        <p><strong>"Can we try it ourselves first?"</strong> Say yes, warmly, and mean it. Then ask
        to follow up on Monday. A client who has just run their own sale badly is a far easier
        conversation, and you now have a date to call them on.</p>
        <p><strong>"What do you think we'd get?"</strong> Do not answer with a number. Ever.
        <em>"I honestly don't know — it depends on the weather and who turns up. What I can tell you
        is what I've seen sell well, and what tends to sit."</em> Then talk about categories. You
        have given them something useful and promised nothing.</p>

        <h3>Close on a date, then send the agreement</h3>
        <p>Do not leave without a specific proposed date. "Sometime next month" dies quietly. Pick a
        weekend, say it out loud, and send the written agreement the same day while the conversation
        is still warm. Both of you sign before you touch a thing in that garage.</p>

        <div class="crs-tip">
          <strong>Bring the agreement with you, printed.</strong> Some clients will sign on the spot,
          and a job signed on the spot cannot cool off over three days of email.
        </div>
      `
    },
    {
      title: "Your city's rules — find them before your first sale",
      minutes: 12,
      html: `
        <h3>This varies more than almost anything else in the job</h3>
        <p>Garage sales are regulated at the city level, and the rules differ wildly between towns
        that are twenty minutes apart. Because you are running sales <em>for other people, for
        payment</em>, some rules land on you rather than on the homeowner. You need to know which.</p>
        <p><strong>Nothing in this lesson is legal advice, and none of it is specific to where you
        are.</strong> What follows is the list of questions to go and get answered.</p>

        <h3>The five things to find out</h3>
        <ol>
          <li><strong>Does a garage sale need a permit?</strong> Many cities require one, often free
          or a few dollars, sometimes obtained the same day online. Some require it to be displayed
          during the sale.</li>
          <li><strong>How many sales per year is a household allowed?</strong> Caps of two or three
          per address per year are common, and they exist specifically to stop somebody running a
          business out of a residential driveway. This matters enormously to you: if you run repeat
          sales at the same address, or several sales across a neighbourhood, you may be the person
          the rule is aimed at.</li>
          <li><strong>What are the sign rules?</strong> Usually the most-enforced part. Typical
          restrictions cover placement (not in the public right-of-way, not on utility poles, not on
          traffic signs), size, how long before the sale they may go up, and how soon after they must
          come down. Fines are real and land on whoever put the sign up.</li>
          <li><strong>Do you need a business licence?</strong> Running sales for other people for a
          fee is a service business, and many cities require registration for that regardless of how
          small it is.</li>
          <li><strong>Is sales tax involved?</strong> Casual sales of used household goods by their
          owner are exempt in many states; a business selling goods on consignment often is not. This
          is a genuine grey area and the answer depends on your state and on how your arrangement is
          structured. Ask an accountant in your state — once, properly — rather than guessing.</li>
        </ol>

        <h3>How to actually find out, in about an hour</h3>
        <ul>
          <li>Search <span class="crs-mono">"[your city] garage sale permit"</span> and use only the
          official <span class="crs-mono">.gov</span> result. Blogs and aggregator sites are
          frequently out of date.</li>
          <li>Look for the municipal code directly: <span class="crs-mono">"[your city] municipal
          code garage sale"</span> usually finds the ordinance itself, which is the actual answer.</li>
          <li>Then <strong>telephone the city clerk's office</strong> and ask plainly: "I run garage
          sales for other people as a service. What do I need?" They answer this kind of question all
          day. Write down who you spoke to and when.</li>
          <li>Do this <strong>for each of your three cities</strong>. They will not match.</li>
        </ul>

        <h3>Write it down where you will find it again</h3>
        <p>Make yourself one page per city: permit needed or not, cost, how to get it, sales-per-year
        cap, sign rules with the exact distances and timings, and the phone number you called. You
        will refer to this before every sale for the rest of your time in this business, and
        re-researching it each time is how sign fines happen.</p>

        <div class="crs-warn">
          <strong>The sign rules are the ones that bite.</strong> Directional arrows are the single
          most effective thing you will do to bring traffic, which means you will be tempted to put
          them everywhere. Know exactly what is allowed in each city, get permission for private
          property placements, and take every sign down promptly. A tidy operator who removes their
          signs on Sunday evening is one the city never has a reason to look at twice.
        </div>
      `
    }
  ]
},

/* ═══════════════════ MODULE 2 ═══════════════════ */
{
  num: 2,
  icon: '🏷️',
  title: 'Pricing what people actually buy',
  tagline: 'Clearance thinking, what moves and what sits, category-by-category pricing, and the markdown schedule that empties a garage.',
  minutes: 56,
  objectives: [
    'Explain why a garage sale is a clearance event and price accordingly.',
    'Predict which items will sell in the first hour and which will not sell at all.',
    'Price the main categories quickly and defensibly, without researching every item.',
    'Build a markdown schedule that brings shoppers back on the last day.'
  ],
  lessons: [
    {
      title: 'The only pricing mindset that works',
      minutes: 14,
      html: `
        <h3>You are running a clearance, not a shop</h3>
        <p>The single most common way a garage sale fails is being priced as though the goods were in
        a shop. The client remembers paying $400 for the patio set. A shopper standing in a driveway
        on a Saturday is not comparing it to $400 — they are comparing it to the effort of loading it
        into their car, and to the identical set they could scroll past online tonight.</p>
        <p>A useful way to hold it in your head: <strong>the price is what makes someone decide
        today, in this driveway, with their own hands.</strong> Anything higher than that is not a
        price, it is an unsold item you have to deal with on Sunday afternoon.</p>

        <h3>Every unsold item costs you twice</h3>
        <p>This is the part clients do not see and you must. An item that does not sell:</p>
        <ul>
          <li>Earned nothing, for the same handling, pricing, and display work as one that did.</li>
          <li>Becomes work again at the end — sorted, boxed, donated, or hauled.</li>
        </ul>
        <p>So the arithmetic on holding out for a higher price is worse than it looks. Take a $40
        item you priced at $60 hoping for the extra $20. At a 50% commission the difference to you is
        $10. What you are actually betting is: your $10 of upside against the item not selling at
        all, earning you nothing, <em>and</em> costing you the labour of clearing it. That bet is bad
        almost every time.</p>

        <h3>Price to sell by Sunday, and price it once</h3>
        <p>Set your price with the whole weekend in view, then let the markdown schedule do the
        negotiating. What you must avoid is the opposite: pricing high, then discounting item by item
        under pressure from whoever pushes hardest. That produces a sale where the confident shoppers
        get bargains and the polite ones pay full price, which is both unfair and slower.</p>

        <h3>Round numbers, and few of them</h3>
        <p>Use $1, $2, $3, $5, $10, $15, $20, $25, $40, $50, $75, $100. Nothing ending in 99 cents —
        this is not a supermarket, and it reads as fussy. Round numbers make mental arithmetic
        instant for shoppers, make change simple for you, and make bundling possible: "those three
        for $10" only works if everything is already in round money.</p>

        <h3>The rule of thumb, offered as exactly that</h3>
        <p>For ordinary used household goods in good condition, a common starting point is somewhere
        around <strong>10–25% of what the item cost new</strong> — the lower end for anything with a
        cheap online equivalent, the higher end for solid, useful, still-current things like good
        tools and quality furniture.</p>
        <p>This is a rule of thumb for getting moving, not a finding about the market. Local demand
        beats it constantly, and after two or three sales your own eye will be better than any
        formula. Trust the thing you have actually watched sell.</p>

        <div class="crs-note">
          <strong>Do not research every item.</strong> A sale has hundreds of things in it and your
          time is finite. Look up the handful that could plausibly be worth over $100 — power tools,
          named furniture, bikes, anything with a brand a collector might want — and price everything
          else on judgement in a few seconds. Spending twenty minutes researching a $6 lamp is a loss
          however accurate the answer.
        </div>
      `
    },
    {
      title: 'What sells, what sits, and what to refuse',
      minutes: 13,
      html: `
        <h3>Sells fast, nearly anywhere</h3>
        <ul>
          <li><strong>Power tools and hand tools.</strong> The most dependable category in this
          trade. Cordless kits with a working battery and charger go first, often within the opening
          hour. Do not underprice these.</li>
          <li><strong>Yard and outdoor equipment.</strong> Mowers, blowers, trimmers, wheelbarrows,
          hoses, ladders. If it starts, demonstrate it starting.</li>
          <li><strong>Camping and sporting goods.</strong> Tents, coolers, fishing gear, bikes.
          Bikes in particular, if the tyres hold air and the brakes work.</li>
          <li><strong>Kitchen equipment that people recognise.</strong> Cast iron, good pans, small
          appliances that still work.</li>
          <li><strong>Kids' gear in clean condition.</strong> Sells to the parents who arrive early
          specifically looking for it.</li>
          <li><strong>Anything with an obvious immediate use.</strong> Extension cords, storage
          totes, fans, shelving, tarps, hardware.</li>
        </ul>

        <h3>Sits, however nice it is</h3>
        <ul>
          <li><strong>Large dark wood furniture.</strong> China cabinets, entertainment units,
          formal dining sets. Solidly made and genuinely unwanted. Price low and accept that the
          alternative may be donation.</li>
          <li><strong>Books, in bulk.</strong> A few interesting ones sell. Fourteen boxes do not.
          Price by the bag.</li>
          <li><strong>Adult clothing.</strong> Slow unless it is genuinely good and displayed on a
          rail. Never in boxes on the ground, where it will not sell at any price.</li>
          <li><strong>Glassware, china, ornaments.</strong> A generation of shoppers who wanted these
          has largely stopped buying. Bundle it.</li>
          <li><strong>Exercise equipment.</strong> Everyone wants it in January and nobody wants to
          move it. Price it to disappear.</li>
          <li><strong>Anything mains-powered that does not work.</strong> "Just needs a new cord" is
          not a selling point. Free box or bin.</li>
        </ul>

        <h3>Refuse or handle separately</h3>
        <p>Some things do not belong in a driveway sale at all, and taking them on creates risk that
        is not worth a percentage of a small number:</p>
        <ul>
          <li><strong>Firearms and ammunition.</strong> Federally and locally regulated, with real
          consequences for getting a transfer wrong. Send the client to a licensed dealer.</li>
          <li><strong>Anything with a title.</strong> Cars, trailers, boats, some machinery. Titles
          get transferred properly or not at all.</li>
          <li><strong>Prescription medication and medical devices.</strong> Not yours to sell.</li>
          <li><strong>Recalled children's items,</strong> especially cots and car seats. Car seats
          also have expiry dates and an unknown crash history — do not sell them at all.</li>
          <li><strong>Anything that might be genuinely valuable.</strong> Not a refusal, a
          redirection: tell the client to get it appraised separately, and put it in writing that it
          is excluded from the sale. This is the habit that keeps you out of the worst dispute in
          this business.</li>
        </ul>

        <h3>The free box earns its space</h3>
        <p>A clearly marked FREE box near the entrance does three useful things: it clears the genuine
        junk that would otherwise cost you disposal, it makes people stop and get out of the car, and
        someone rummaging in it is a shopper who is now inside your sale rather than driving past.</p>

        <div class="crs-tip">
          <strong>Put the tools where they can be seen from the street.</strong> Tools bring the
          shoppers who spend the most, and if they cannot tell from the road that there are tools,
          they do not stop. Same logic for bikes and furniture: your best category goes at the front,
          always.
        </div>
      `
    },
    {
      title: 'Pricing the categories quickly',
      minutes: 15,
      html: `
        <h3>Work in passes, not item by item</h3>
        <p>Do not walk the garage pricing whatever your hand lands on. Sort into categories first,
        then price a whole category in one sitting. You will be far faster and far more consistent —
        and consistency matters, because two similar items with wildly different prices makes a
        shopper distrust every price in the sale.</p>

        <h3>Tools</h3>
        <p>The category worth slowing down for, because it carries the most value and the most
        variation. Cordless kits: test that the battery holds a charge, and say so on the tag —
        "battery tested, holds charge" is worth real money. Missing battery or charger cuts value
        sharply, so pair up what you can from elsewhere in the garage. Hand tools sell well in
        bundles by type: all the screwdrivers together, all the clamps together. Named brands hold
        value noticeably better than unbranded equivalents.</p>

        <h3>Furniture</h3>
        <p>Judge it on three things, in this order: <strong>is it solid, is it a size people can
        actually use, and is it a colour people currently want.</strong> Solid wood beats particle
        board every time and by a lot. Anything with water damage, a wobble, or a smell is a donation
        no matter what it cost. Price to move on the first day — furniture that does not sell is the
        heaviest problem you will have on Sunday evening.</p>

        <h3>Yard and outdoor</h3>
        <p>Working condition is the whole price. A mower that starts is worth several times one that
        might. Get everything running before the sale if you can, and demonstrate it — starting a
        mower in front of someone closes the sale on the spot. Clean it. Dirt reads as neglect and
        knocks the price down further than the cleaning takes.</p>

        <h3>Kids' items</h3>
        <p>Clean sells, tired does not, and the difference is almost entirely presentation. Wipe
        everything. Group by age. Bag small toys in sets rather than heaping them loose. Check for
        recalls on anything a child sits or sleeps in, and skip car seats entirely.</p>

        <h3>Kitchen and housewares</h3>
        <p>Small appliances need to be shown working — keep an extension cord out for exactly this.
        Cast iron sells well and does not need to be perfect. Bundle the mismatched: a box of
        assorted utensils at $5 outperforms forty individually priced utensils, and takes four
        minutes instead of an hour.</p>

        <h3>Bundling is a pricing technique, not laziness</h3>
        <p>For anything low-value and numerous, price the group. "This box, $10." "Fill a bag for
        $5." It moves volume, it saves you hours of tagging, and it lets a shopper feel they have
        done well — which is most of what they came for.</p>

        <h3>Tag so a shopper never has to ask</h3>
        <p>Every item priced, visibly. An unpriced item means either a shopper who walks away rather
        than asking, or a negotiation you did not choose to open. Use the price cards in the sign
        maker for anything large enough to warrant one, and masking tape with a marker for everything
        else. On the good stuff, add one line of why it is worth the money — "starts first pull",
        "new blade", "battery tested". That line is your salesperson when you are busy at the till.</p>

        <div class="crs-note">
          <strong>Record your floor, never show it.</strong> For every item over about $20, decide
          the lowest you will take and put it in the item's private floor field in your dashboard. It
          is deliberately excluded from your public listing — not merely hidden, but left out of the
          published data entirely — so you can negotiate on the day from a number you set calmly in
          advance rather than one you invent under pressure.
        </div>
      `
    },
    {
      title: 'The markdown schedule',
      minutes: 14,
      html: `
        <h3>Announced discounts do two jobs at once</h3>
        <p>A published markdown schedule clears the garage <em>and</em> brings people back. A shopper
        who liked the $60 dresser but did not buy it now has a reason to return on Sunday — and once
        they are back, they buy other things too. Without a schedule, the same shopper simply
        leaves.</p>
        <p>It also moves every negotiation onto ground you chose. "Would you take $30?" on Saturday
        morning has an easy, friendly, non-adversarial answer: "It's half price tomorrow — but
        somebody may well take it today."</p>

        <h3>A three-day schedule that works</h3>
        <div class="crs-diagram">
          <svg viewBox="0 0 640 190" role="img" aria-label="Three-day markdown schedule: Friday full price, Saturday 25 percent off from midday, Sunday half price then make an offer from 1pm">
            <line x1="40" y1="120" x2="600" y2="120" stroke="#16130E" stroke-width="4"/>
            <g font-family="Anton, Impact, sans-serif" font-size="19" fill="#16130E" text-anchor="middle" style="text-transform:uppercase;">
              <text x="130" y="150">Friday</text>
              <text x="320" y="150">Saturday</text>
              <text x="510" y="150">Sunday</text>
            </g>
            <g font-family="'Libre Franklin', sans-serif" font-size="13" fill="#3B3325" text-anchor="middle">
              <text x="130" y="170">Best selection</text>
              <text x="320" y="170">The busiest day</text>
              <text x="510" y="170">Clear the garage</text>
            </g>
            <rect x="60" y="72" width="140" height="34" fill="#FFCE3B" stroke="#16130E" stroke-width="3"/>
            <text x="130" y="95" font-family="Anton, Impact, sans-serif" font-size="17" fill="#16130E" text-anchor="middle">FULL PRICE</text>
            <rect x="250" y="72" width="140" height="34" fill="#E8471F" stroke="#16130E" stroke-width="3"/>
            <text x="320" y="95" font-family="Anton, Impact, sans-serif" font-size="17" fill="#fff" text-anchor="middle">25% OFF PM</text>
            <rect x="440" y="72" width="140" height="34" fill="#C0311F" stroke="#16130E" stroke-width="3"/>
            <text x="510" y="95" font-family="Anton, Impact, sans-serif" font-size="17" fill="#fff" text-anchor="middle">HALF PRICE</text>
            <rect x="440" y="30" width="140" height="30" fill="none" stroke="#16130E" stroke-width="2" stroke-dasharray="5 4"/>
            <text x="510" y="50" font-family="'Libre Franklin', sans-serif" font-size="12" font-weight="700" fill="#16130E" text-anchor="middle">1pm: make an offer</text>
            <circle cx="130" cy="120" r="7" fill="#16130E"/>
            <circle cx="320" cy="120" r="7" fill="#16130E"/>
            <circle cx="510" cy="120" r="7" fill="#16130E"/>
          </svg>
          <p class="crs-caption">A schedule people can plan around. Print it on the main sign and say
          it out loud to everyone who hesitates over something.</p>
        </div>

        <ul>
          <li><strong>Day one — full price.</strong> The selection is complete and the keenest
          shoppers arrive first. Hold prices; the people here at 8am are here because they want first
          choice, not a discount.</li>
          <li><strong>Day two — full price in the morning, 25% off from midday.</strong> Usually your
          busiest day. The afternoon discount creates a second wave without giving away the morning.</li>
          <li><strong>Day three — half price, then make-an-offer from early afternoon.</strong> This
          is the day the garage empties. By the last two hours the goal is not price, it is that
          things leave in someone else's car rather than needing to be dealt with.</li>
        </ul>

        <h3>Two things the schedule protects</h3>
        <p><strong>Hold the good tools at full price on day one.</strong> They will sell. Discounting
        the fastest-moving category on the busiest morning gives away money for nothing.</p>
        <p><strong>Exclude anything you have agreed a floor on with the client.</strong> If a specific
        item has a "not below $X" agreed in writing, it is not in the markdown. Tag it, know which
        ones they are, and tell any staff working with you.</p>

        <h3>By the last hour, price is not the point</h3>
        <p>An item still sitting at 3pm on the final day has told you what it is worth. Bundle
        aggressively, say yes to reasonable offers, and let things go. Every item that leaves is one
        you do not have to box, donate, or pay to remove — and clearing the garage is what the client
        actually hired you to do.</p>

        <div class="crs-tip">
          <strong>Put the schedule on the sign and on your website.</strong> A shopper who knows
          Sunday is half price is a shopper with a reason to come twice. One who does not know is a
          shopper who came once.
        </div>
      `
    }
  ]
},

/* ═══════════════════ MODULE 3 ═══════════════════ */
{
  num: 3,
  icon: '🪧',
  title: 'Running sale day',
  tagline: 'Staging a driveway, getting traffic to it, and working the sale itself — money, haggling, and safety.',
  minutes: 46,
  objectives: [
    'Lay out a driveway so shoppers walk the whole sale rather than glancing and leaving.',
    'Place signs where they actually produce traffic, within your city\'s rules.',
    'Handle cash, cards, haggling, and early birds without losing control of the sale.',
    'Run a sale that is safe for shoppers and for the client\'s property.'
  ],
  lessons: [
    {
      title: 'Setting up: staging a driveway',
      minutes: 15,
      html: `
        <h3>Set up the day before, not the morning of</h3>
        <p>Trying to price, stage, and open on the same morning goes badly, every time. Shoppers
        arrive while you are still carrying tables, nothing is where you meant it to be, and you
        spend the first hour flustered instead of selling. Get everything out and arranged the
        evening before, then cover it or move it back a few feet inside.</p>

        <h3>The layout that works</h3>
        <div class="crs-diagram">
          <svg viewBox="0 0 640 300" role="img" aria-label="Driveway layout: best items nearest the street, tables forming a walkway, pay station at the exit, furniture along one side">
            <rect x="0" y="0" width="640" height="300" fill="#F6F0E1"/>
            <rect x="0" y="255" width="640" height="45" fill="#D8CEB4"/>
            <text x="320" y="283" font-family="'Space Mono', monospace" font-size="12" font-weight="700" fill="#6B6355" text-anchor="middle" letter-spacing="3">STREET</text>

            <rect x="150" y="20" width="340" height="60" fill="#EDE5D0" stroke="#16130E" stroke-width="3"/>
            <text x="320" y="56" font-family="Anton, Impact, sans-serif" font-size="17" fill="#16130E" text-anchor="middle">GARAGE</text>

            <rect x="185" y="200" width="120" height="34" fill="#E8471F" stroke="#16130E" stroke-width="3"/>
            <text x="245" y="222" font-family="Anton, Impact, sans-serif" font-size="13" fill="#fff" text-anchor="middle">TOOLS · BIKES</text>
            <rect x="335" y="200" width="120" height="34" fill="#E8471F" stroke="#16130E" stroke-width="3"/>
            <text x="395" y="222" font-family="Anton, Impact, sans-serif" font-size="13" fill="#fff" text-anchor="middle">YARD GEAR</text>

            <rect x="185" y="145" width="120" height="34" fill="#fff" stroke="#16130E" stroke-width="2"/>
            <text x="245" y="167" font-family="'Libre Franklin', sans-serif" font-size="12" font-weight="700" fill="#16130E" text-anchor="middle">Kitchen · Kids</text>
            <rect x="335" y="145" width="120" height="34" fill="#fff" stroke="#16130E" stroke-width="2"/>
            <text x="395" y="167" font-family="'Libre Franklin', sans-serif" font-size="12" font-weight="700" fill="#16130E" text-anchor="middle">Housewares</text>

            <rect x="500" y="95" width="105" height="140" fill="#fff" stroke="#16130E" stroke-width="2"/>
            <text x="552" y="160" font-family="'Libre Franklin', sans-serif" font-size="12" font-weight="700" fill="#16130E" text-anchor="middle">Furniture</text>
            <text x="552" y="178" font-family="'Libre Franklin', sans-serif" font-size="11" fill="#6B6355" text-anchor="middle">(visible,</text>
            <text x="552" y="192" font-family="'Libre Franklin', sans-serif" font-size="11" fill="#6B6355" text-anchor="middle">out of the way)</text>

            <rect x="40" y="150" width="90" height="60" fill="#FFCE3B" stroke="#16130E" stroke-width="3"/>
            <text x="85" y="176" font-family="Anton, Impact, sans-serif" font-size="14" fill="#16130E" text-anchor="middle">PAY</text>
            <text x="85" y="196" font-family="Anton, Impact, sans-serif" font-size="14" fill="#16130E" text-anchor="middle">HERE</text>

            <rect x="40" y="222" width="90" height="26" fill="none" stroke="#16130E" stroke-width="2" stroke-dasharray="4 3"/>
            <text x="85" y="240" font-family="'Libre Franklin', sans-serif" font-size="11" font-weight="700" fill="#16130E" text-anchor="middle">FREE BOX</text>

            <path d="M320 250 L320 120 L150 120 L130 150" stroke="#1E8A4C" stroke-width="3" fill="none" stroke-dasharray="7 5"/>
            <polygon points="130,150 138,140 122,140" fill="#1E8A4C"/>
            <text x="240" y="112" font-family="'Libre Franklin', sans-serif" font-size="11" font-weight="700" fill="#1E8A4C" text-anchor="middle">the route a shopper walks</text>
          </svg>
          <p class="crs-caption">Best items nearest the street. Tables forming a corridor rather than
          a wall. Pay station at the exit, so nobody leaves without passing you.</p>
        </div>

        <h3>Five rules of staging</h3>
        <ol>
          <li><strong>Your strongest category goes nearest the street.</strong> A driver decides in
          about two seconds whether this sale is worth stopping for. Tools, bikes, and furniture make
          that decision for them.</li>
          <li><strong>Everything up off the ground.</strong> Items on the floor do not sell. Tables,
          crates, a sheet of ply on two sawhorses — anything that raises things to waist height.
          This single change moves more goods than any price cut.</li>
          <li><strong>Make a walkway, not a barricade.</strong> Arrange tables so shoppers walk
          <em>between</em> them and end up seeing everything. A single line of tables across the
          driveway means people scan from the pavement and drive on.</li>
          <li><strong>Pay station at the exit, with your back to nothing.</strong> One way out, past
          you. You can see the whole sale, and every departing shopper passes the till.</li>
          <li><strong>Clothing on a rail or not at all.</strong> If you cannot hang it, price it by
          the bag. Folded clothing in boxes does not sell at any price.</li>
        </ol>

        <h3>What to have with you</h3>
        <ul>
          <li>A float of small notes and coins — plenty of $1s and $5s. Being unable to change a $20
          at 8:05am costs you sales.</li>
          <li>A phone card reader. Some shoppers carry no cash at all, and a $180 item lost for want
          of a card reader is a bad trade.</li>
          <li>Tables, a rail, extension cords, tape, markers, blank price cards, carrier bags,
          newspaper for wrapping.</li>
          <li>A chair, water, sun cover. It is a long day and you will be there all of it.</li>
          <li>Your permit, if your city requires one — displayed if that is the rule.</li>
        </ul>

        <div class="crs-tip">
          <strong>Have a wet-weather plan before you need one.</strong> Know in advance what moves
          under cover, what gets a tarp, and at what point you postpone. Deciding this at 6am in the
          rain produces the wrong answer.
        </div>
      `
    },
    {
      title: 'Signs and getting traffic',
      minutes: 15,
      html: `
        <h3>Arrow signs are the highest-return thing you do</h3>
        <p>Online listings bring the people who were already looking for a sale. <strong>Signs bring
        everyone else</strong> — and on most sale days that is the larger group. A well-signed sale
        and a badly-signed one in the same street will have visibly different days.</p>

        <h3>What makes a sign work from a moving car</h3>
        <p>A driver has roughly two seconds and is thirty feet away. That allows about four words and
        one arrow. Everything else on the sign is for people already stopped.</p>
        <ul>
          <li><strong>Huge type, few words.</strong> "GARAGE SALE" and an arrow. Not your business
          name in the largest font, not the full address, not the dates.</li>
          <li><strong>Black on yellow.</strong> The highest-contrast pairing at distance, which is
          why road signs use it. The sign maker defaults to it.</li>
          <li><strong>A drawn arrow, not a typed one.</strong> A big solid filled arrow reads
          instantly. A text character prints thin and grey and disappears at speed.</li>
          <li><strong>Positioned to be read, not just placed.</strong> Face oncoming traffic, at
          about eye height for a driver, not flat against a fence at knee level.</li>
        </ul>

        <h3>Where to put them</h3>
        <div class="crs-diagram">
          <svg viewBox="0 0 640 260" role="img" aria-label="Sign placement: arrows at each turn on the route from the main road to the sale house">
            <rect x="0" y="0" width="640" height="260" fill="#F6F0E1"/>
            <rect x="0" y="200" width="640" height="34" fill="#D8CEB4"/>
            <text x="80" y="223" font-family="'Space Mono', monospace" font-size="11" font-weight="700" fill="#6B6355" letter-spacing="2">MAIN ROAD</text>
            <rect x="230" y="60" width="26" height="145" fill="#D8CEB4"/>
            <rect x="230" y="60" width="330" height="26" fill="#D8CEB4"/>

            <rect x="480" y="30" width="70" height="46" fill="#EDE5D0" stroke="#16130E" stroke-width="3"/>
            <text x="515" y="58" font-family="Anton, Impact, sans-serif" font-size="13" fill="#16130E" text-anchor="middle">SALE</text>

            <g>
              <rect x="200" y="212" width="34" height="26" fill="#FFCE3B" stroke="#16130E" stroke-width="2"/>
              <polygon points="209,225 220,218 220,232" fill="#16130E" transform="rotate(-90 217 225)"/>
              <text x="217" y="253" font-family="'Libre Franklin', sans-serif" font-size="10" font-weight="700" fill="#16130E" text-anchor="middle">1</text>
            </g>
            <g>
              <rect x="262" y="92" width="34" height="26" fill="#FFCE3B" stroke="#16130E" stroke-width="2"/>
              <polygon points="271,105 282,98 282,112" fill="#16130E"/>
              <text x="279" y="134" font-family="'Libre Franklin', sans-serif" font-size="10" font-weight="700" fill="#16130E" text-anchor="middle">2</text>
            </g>
            <g>
              <rect x="430" y="92" width="34" height="26" fill="#FFCE3B" stroke="#16130E" stroke-width="2"/>
              <polygon points="439,105 450,98 450,112" fill="#16130E" transform="rotate(-90 447 105)"/>
              <text x="447" y="134" font-family="'Libre Franklin', sans-serif" font-size="10" font-weight="700" fill="#16130E" text-anchor="middle">3</text>
            </g>
            <g>
              <rect x="470" y="88" width="34" height="26" fill="#E8471F" stroke="#16130E" stroke-width="2"/>
              <text x="487" y="106" font-family="Anton, Impact, sans-serif" font-size="12" fill="#fff" text-anchor="middle">HERE</text>
            </g>

            <path d="M215 200 L243 200 L243 100 L487 100 L487 80" stroke="#1E8A4C" stroke-width="3" fill="none" stroke-dasharray="7 5"/>
            <text x="330" y="180" font-family="'Libre Franklin', sans-serif" font-size="12" font-weight="700" fill="#1E8A4C">one arrow at every decision point</text>
          </svg>
          <p class="crs-caption">A sign at each turn between the busiest nearby road and the house.
          A driver should never have to guess which way next.</p>
        </div>
        <p>Start from the nearest busy road and work in. Put an arrow at <strong>every point where a
        driver has to make a decision</strong>, and one at the house itself. Three or four arrows on a
        clear route beats a dozen scattered ones. Then drive the route yourself, at normal speed, as
        though you had never been there. You will find at least one arrow you cannot read.</p>

        <h3>Within the rules you looked up in Module 1</h3>
        <p>Sign rules are the most-enforced part of garage sale regulation and the fines land on
        whoever put the sign up — you. Stay off the public right-of-way and utility poles, never
        attach anything to a traffic sign, ask permission for private property placements, and take
        every sign down when the sale ends. Operators who leave signs up on Monday are the reason
        cities tighten these rules.</p>

        <h3>Online, in the two hours it deserves</h3>
        <ul>
          <li><strong>Your own site first.</strong> Publish the sale with photos and prices, because
          every other listing and every QR code points here. A shopper who has already seen the tool
          set arrives intending to buy it.</li>
          <li><strong>The local groups and the classifieds.</strong> Post Wednesday or Thursday for a
          weekend sale — earlier is forgotten, Friday night is too late for people to plan.</li>
          <li><strong>Photos of the best six things.</strong> Not the whole garage. One clear,
          well-lit photograph of the tool kit will bring more people than thirty blurry ones.</li>
          <li><strong>Say the categories in the text.</strong> People search for "tools", "bikes",
          "camping". Write those words.</li>
        </ul>

        <div class="crs-note">
          <strong>Put the QR code on the main sign.</strong> Someone driving past at 5pm on Thursday
          who cannot stop can scan it and see the whole sale from their phone that evening. That is a
          shopper you would otherwise never have had.
        </div>
      `
    },
    {
      title: 'Working the sale',
      minutes: 16,
      html: `
        <h3>The first hour decides the day</h3>
        <p>Your keenest shoppers, resellers, and anyone hunting a specific category all arrive at or
        before opening. This is when the tools go. Be completely ready before your stated opening
        time — not nearly ready.</p>

        <h3>Early birds</h3>
        <p>Someone will arrive forty minutes early. Every time. Decide your policy in advance and
        apply it evenly:</p>
        <ul>
          <li><strong>Hold the line politely.</strong> "We open at eight — happy to have you wait."
          Fairest to everyone who turned up on time, and it prevents the sale starting while you are
          still setting out tables.</li>
          <li><strong>Or open early and say so.</strong> Also fine. What is not fine is letting one
          person in and turning the next away — that is the thing that produces an argument.</li>
        </ul>

        <h3>Money</h3>
        <ul>
          <li><strong>The cash stays on you.</strong> A bum bag or apron, never a box on a table, and
          never left unattended for a moment.</li>
          <li><strong>Take large notes out of circulation.</strong> Move $50s and $100s into a
          separate pocket as they come in, so your working float stays small.</li>
          <li><strong>Take cards.</strong> A phone reader costs little and rescues every high-ticket
          sale where the shopper has $40 in cash and wants a $200 item.</li>
          <li><strong>Write down anything over about $20 as it sells,</strong> with the price. You owe
          the client a written summary at settlement, and reconstructing it from memory on Sunday
          night is both painful and inaccurate.</li>
          <li><strong>Count out change out loud.</strong> It is faster, it prevents disputes, and it
          keeps you accurate at hour seven when you are tired.</li>
        </ul>

        <h3>Haggling, without losing the day</h3>
        <p>Everyone will try. Treat it as completely normal, because it is — and have three answers
        ready so you are never inventing one under pressure:</p>
        <ul>
          <li><strong>Point at the schedule.</strong> "It's half price on Sunday — though it may well
          go today." Friendly, true, and it hands them the decision.</li>
          <li><strong>Bundle instead of discounting.</strong> "I can't do $20 on that, but I'll put
          those two with it for $35." You protect the price and move more goods.</li>
          <li><strong>Use your floor.</strong> You set it in advance, calmly, in your dashboard. If
          the offer clears it, take it. If not, say no pleasantly and move on. This is exactly why
          the floor exists — so the answer is already decided and not a judgement call while someone
          stands there waiting.</li>
        </ul>
        <p>Say no without apology and without irritation. Most people expected a no and will buy
        anyway; a few will come back on the last day.</p>

        <h3>Reselling and bulk offers</h3>
        <p>Resellers are not a problem, they are volume. Someone offering $80 for a table of items
        priced at $130 is offering you a cleared table and no further handling — often worth taking,
        especially later in the sale. Just do the arithmetic against your floors rather than the
        feeling of being negotiated with.</p>

        <h3>Safety, and the client's property</h3>
        <ul>
          <li><strong>Nobody goes in the house.</strong> Not for the bathroom, not to see the sofa.
          Decide this before you need it and hold it. If the sale includes indoor furniture, either
          bring it out or escort every viewing personally.</li>
          <li><strong>Do not work a whole sale alone if you can avoid it.</strong> Two people means
          one can watch the sale while the other helps carry, and it substantially reduces theft.</li>
          <li><strong>Keep the walkways genuinely clear.</strong> Extension cords taped down, no
          trip hazards, nothing balanced on anything. You are inviting the public onto someone
          else's property and their insurance may well not cover it.</li>
          <li><strong>Shoppers carry their own heavy items,</strong> and you say so before they buy.
          Helping is fine; being responsible for their back is not.</li>
          <li><strong>Watch the small valuables.</strong> Anything easily pocketed sits at the pay
          station, not out on a far table.</li>
        </ul>

        <h3>The last two hours</h3>
        <p>Switch from selling to clearing. Bundle hard, say yes to most reasonable offers, and get
        volume out of the driveway. Then take down every sign, sweep the space, and leave it
        broom-clean. The state you leave the property in is what the client tells their neighbours
        about.</p>

        <div class="crs-tip">
          <strong>Take a photo of the empty, swept space before you leave.</strong> It settles any
          later question about how you left things, and it is the single best photograph you have for
          showing the next client what "cleared" means.
        </div>
      `
    }
  ]
},

/* ═══════════════════ MODULE 4 ═══════════════════ */
{
  num: 4,
  icon: '📈',
  title: 'Turning one job into three',
  tagline: 'Settling up properly, where the next job actually comes from, and the small number of figures worth tracking.',
  minutes: 40,
  objectives: [
    'Settle with a client in a way that produces a referral rather than a query.',
    'Name the specific moments after a sale when the next job is easiest to win.',
    'Track the handful of numbers that tell you whether the business is working.',
    'Decide when to bring in help, and what to hand over first.'
  ],
  lessons: [
    {
      title: 'Settling up, and the handover',
      minutes: 13,
      html: `
        <h3>Settlement is where referrals are made or lost</h3>
        <p>By this point the work is done and the client's opinion of you is mostly formed — but not
        entirely. A clear, prompt, unprompted settlement turns a satisfied client into one who
        recommends you. A vague one, or one they had to chase, undoes a genuinely good weekend.</p>

        <h3>What to hand over</h3>
        <p>Within the number of days your agreement specifies — and sooner is better — give them one
        page containing:</p>
        <ul>
          <li><strong>Gross sales.</strong> The total taken in.</li>
          <li><strong>Your fee,</strong> shown as the percentage and the money, so the arithmetic is
          visible rather than asserted.</li>
          <li><strong>Any agreed deductions,</strong> itemised — a haul-away fee, for instance.</li>
          <li><strong>The amount due to them,</strong> and the payment itself.</li>
          <li><strong>What happened to the unsold items,</strong> with the donation receipt if there
          is one.</li>
          <li><strong>A short list of what sold well,</strong> which costs you nothing and is the
          part clients find genuinely interesting.</li>
        </ul>
        <p>Pay at the same time as you present it. Presenting the figures and paying three days later
        makes the whole thing feel unresolved.</p>

        <h3>Be straightforwardly honest about a disappointing sale</h3>
        <p>Some sales take far less than the client hoped. Do not pad, hedge, or blame the client's
        pricing expectations — say plainly what happened:</p>
        <blockquote>"Saturday was rained off, which cost us the busiest day. The tools and the yard
        equipment sold exactly as I'd expect; the furniture and the china didn't move at all, which
        is normal at the moment. Here's the total and here's your share."</blockquote>
        <p>Clients handle bad news well when it arrives promptly and with a reason. What they do not
        forgive is discovering it themselves, late.</p>

        <h3>Ask for the two things, once</h3>
        <p>At settlement, while goodwill is at its highest:</p>
        <ol>
          <li><strong>A referral.</strong> Be specific, because a specific question gets an answer
          and a vague one gets "sure, I'll keep you in mind." Try: <em>"Is there anyone else in your
          street or your family thinking about clearing out?"</em></li>
          <li><strong>A review.</strong> One sentence somewhere public. Ask right then, and make it
          effortless — send the link that evening while they still remember you fondly.</li>
        </ol>
        <p>Ask once, cheerfully, and then leave it. Asking twice converts a referral into an
        irritation.</p>

        <h3>Then write it all down</h3>
        <p>Update their record in your client list: what sold, what it took, what you would do
        differently, whether you would work with them again. Move them to Completed. Those notes are
        what make the second sale at that address — and there often is one — quick and profitable.</p>

        <div class="crs-note">
          <strong>Keep your own copy of everything.</strong> The signed agreement, your sales record,
          the settlement summary, the donation receipt. Your saved agreements hold the exact wording
          each client signed, which is the thing you will want if a question ever arises months
          later.
        </div>
      `
    },
    {
      title: 'Where the next job comes from',
      minutes: 13,
      html: `
        <h3>The best time to find work is during work</h3>
        <p>A sale in progress is the most effective advertising you will ever run, and it is already
        paid for. Dozens of local people are standing in a driveway watching you competently run the
        exact service you sell.</p>
        <ul>
          <li><strong>The neighbours.</strong> They have watched the traffic all weekend and thought
          about their own garage. Talk to them. This is the single warmest lead source in the trade
          and it is standing on the pavement.</li>
          <li><strong>Your name on every sign.</strong> Small, at the bottom — the sign maker puts it
          there. Somebody drives past forty of your signs over a weekend without ever attending the
          sale.</li>
          <li><strong>Shoppers who mention their own clutter.</strong> Several will. Have cards.</li>
        </ul>

        <h3>Referrals compound; advertising does not</h3>
        <p>A client who recommends you brings someone who already trusts you, needs no convincing on
        price, and is far more likely to sign. Two referrals from every satisfied client is a
        business that grows without an advertising budget — which is why the settlement conversation
        in the last lesson matters more than any marketing you could buy.</p>

        <h3>The relationships worth building deliberately</h3>
        <p>Two or three good professional relationships will outproduce every other source combined,
        because they generate work repeatedly without you doing anything:</p>
        <ul>
          <li><strong>Real estate agents</strong> with listings full of furniture. You solve their
          problem free of charge to them. Once one agent trusts you, they will use you on every
          suitable listing.</li>
          <li><strong>Property managers and landlords.</strong> Turnover never stops.</li>
          <li><strong>Movers, cleaners, and clear-out firms.</strong> Inside full houses daily and
          asked "do you know anyone who…" constantly.</li>
          <li><strong>Senior-move specialists,</strong> where they exist near you. Downsizing is
          their entire business and a sale is often the missing piece of it.</li>
        </ul>
        <p>Approach these as a genuine two-way arrangement, not a request. What you offer an agent is
        a house that shows better and a seller who is no longer overwhelmed. Say it that way.</p>

        <h3>Off-season, and the fact that this trade has one</h3>
        <p>Garage sales are seasonal nearly everywhere. Plan for the quiet months rather than being
        surprised by them:</p>
        <ul>
          <li><strong>Moving and downsizing continue year-round.</strong> Lean on those two sources
          when the weather stops casual sales.</li>
          <li><strong>Indoor sales work.</strong> A cleared garage with the door open, or a basement,
          extends your season noticeably.</li>
          <li><strong>Use the quiet time on relationships.</strong> The agents and property managers
          you meet in February are the ones who call you in May.</li>
        </ul>

        <div class="crs-tip">
          <strong>Follow up the "not yet" list every single month.</strong> It is the highest-value
          hour in your calendar and almost nobody does it. Anyone who said "maybe in the spring" is a
          job waiting for one phone call — and you already have their number written down.
        </div>
      `
    },
    {
      title: 'The numbers, and bringing in help',
      minutes: 14,
      html: `
        <h3>Five figures, and no more</h3>
        <p>You do not need a spreadsheet with thirty columns. You need to know whether the work is
        worth doing and which part of it to change. These five tell you:</p>
        <ol>
          <li><strong>Gross sales per sale.</strong> What the sale took in. The headline number, and
          the one that tells you whether you are choosing the right jobs.</li>
          <li><strong>Your fee per sale.</strong> Your actual earnings from it, after any minimum or
          agreed deduction.</li>
          <li><strong>Hours you put in, honestly counted.</strong> Sorting, pricing, advertising,
          signs, both sale days, clearing, settlement. Count all of it, including the driving.</li>
          <li><strong>Your fee divided by your hours.</strong> The number that actually matters, and
          the one nobody tracks. A sale with a big gross and thirty hours in it can be worse than a
          modest one with eight.</li>
          <li><strong>Conversations to booked jobs.</strong> How many first conversations produce a
          signed agreement. It tells you whether your problem is finding people or converting
          them — two completely different fixes.</li>
        </ol>

        <h3>What the ratio will teach you</h3>
        <p>Once you have three or four sales measured, patterns appear that no amount of thinking
        would have produced:</p>
        <ul>
          <li>Which <em>type</em> of job pays best for your time. Very often the moving sales, because
          the deadline makes the client decisive and everything must go.</li>
          <li>Which categories are worth the hours you spend on them. Pricing three hundred
          individual glasses is usually a loss; the tool bench usually is not.</li>
          <li>Where your hours actually go. Most operators are startled by how much of the total is
          sorting and pricing rather than the sale itself — which is precisely the part to get help
          with first.</li>
        </ul>

        <h3>When to bring in help</h3>
        <p>Two signals, either of which is enough:</p>
        <ul>
          <li><strong>You are turning down work</strong> because two sales collide on one weekend.</li>
          <li><strong>You are working a whole sale alone,</strong> which costs you in theft, in
          missed sales while you carry things, and in your own capacity to think by hour six.</li>
        </ul>
        <p>Hand over the sorting and hauling first — it is the least skilled, most physical, most
        time-consuming part, and the easiest to explain to someone new. Keep pricing and the client
        relationship yourself for as long as you can: those are the two things your judgement is
        actually worth money for.</p>

        <h3>If you take someone on, do it properly</h3>
        <p>Whether a helper is an employee or an independent contractor is a legal question with real
        consequences — for tax withholding, for insurance, and for who is liable if they are hurt at
        a client's property. The answer depends on your state and on how the arrangement genuinely
        works in practice, not on what you call it. <strong>Talk to an accountant in your state
        before the first payment, not after.</strong> This is the kind of thing that is cheap to get
        right at the start and expensive to unwind.</p>

        <h3>Where this can go</h3>
        <p>You now have the whole job: the offer, where the work comes from, the conversation that
        books it, how to price it, how to run the day, and how one job becomes the next. What decides
        the outcome from here is how many first conversations you have, and whether you write down
        what happens in each one.</p>
        <p>Nothing in this course promises what you will earn, and you should distrust anyone who
        does. What it does say is that the mechanics are not complicated, the barrier to starting is a
        car and a weekend, and the three cities on your account are yours to work.</p>

        <div class="crs-note">
          <strong>Go and book one job.</strong> Not a plan, not a logo, not a better website — one
          conversation with one person who has a garage they are tired of. Everything in this course
          is easier to understand once you have run a single sale, and nothing in it substitutes for
          having done that.
        </div>
      `
    }
  ]
}

];
