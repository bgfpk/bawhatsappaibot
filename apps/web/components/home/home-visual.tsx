function Conversation() {
  return (
    <div className="home-chat-stack">
      <div className="home-bubble home-user">Which plan is best for my business?</div>
      <div className="home-ai-card">
        <strong><span className="home-spark">*</span> BlackArrow</strong>
        <p>How many customers does your team usually help on WhatsApp each month?</p>
      </div>
      <div className="home-bubble home-user">About 2,000. We have three staff members.</div>
      <div className="home-ai-card home-ai-card-compact">
        <strong><span className="home-spark">*</span> BlackArrow</strong>
        <p>Growth may be a good fit. I’ve saved those details so the team can help you choose.</p>
      </div>
    </div>
  );
}

export function HomeHeroVisual() {
  return (
    <div className="home-visual" aria-label="BlackArrow WhatsApp conversation and team activity preview">
      <div className="home-rings" aria-hidden="true" />
      <article className="home-float home-handoff">
        <div className="home-card-title"><b>Team attention</b><span>3 waiting</span></div>
        <p>Important customer conversations stay visible for human follow-up.</p>
      </article>
      <article className="home-phone">
        <div className="home-phone-screen">
          <div className="home-wa-head"><div><span>AI</span>BlackArrow</div><i /></div>
          <Conversation />
        </div>
      </article>
      <article className="home-order-card">
        <div className="home-card-title"><b>Customer details</b><span>Saved</span></div>
        <div className="home-order-item"><span>1</span><b>2,000 customers / month</b></div>
        <div className="home-order-item"><span>2</span><b>Three team members</b></div>
        <div className="home-order-item"><span>3</span><b>Interested in Growth</b></div>
      </article>
      <article className="home-float home-lead">
        <div className="home-card-title"><b>Suggested next action</b><span>Review</span></div>
        <p>Check the saved details and help the customer confirm the right plan.</p>
      </article>
    </div>
  );
}

export function HomeWorkflowVisual() {
  return (
    <article className="home-workflow-visual" aria-label="Example WhatsApp customer journey">
      <div className="home-workflow-phone">
        <div className="home-wa-head"><div><span>AI</span>Plan enquiry</div><i /></div>
        <Conversation />
      </div>
      <div className="home-workflow-summary">
        <div className="home-card-title"><b>Team activity</b><span>Needs attention</span></div>
        <h3>Plan enquiry saved</h3>
        <p>Customer volume and team size were added to the conversation summary.</p>
        <ul>
          <li>Saved flow is available if the team chooses to send it.</li>
          <li>Suggested next action: review plan fit.</li>
        </ul>
      </div>
    </article>
  );
}
