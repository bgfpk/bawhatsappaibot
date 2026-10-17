const SETUP_TUTORIAL_URL = "https://www.youtube.com/watch?v=4-47Ursh0Fo";
const SETUP_TUTORIAL_EMBED_URL = "https://www.youtube-nocookie.com/embed/4-47Ursh0Fo?rel=0";

export function HomeTutorialVideo() {
  return (
    <article className="home-tutorial-video" aria-label="BlackArrow setup tutorial video">
      <div className="home-tutorial-copy">
        <span className="home-label">Setup tutorial</span>
        <h3>Watch the setup walkthrough before connecting your number.</h3>
        <p>
          See the practical setup flow from account creation to WhatsApp connection, then use the
          dashboard to configure products, replies, and handoff rules.
        </p>
        <a href={SETUP_TUTORIAL_URL} target="_blank" rel="noopener noreferrer">
          Open tutorial on YouTube
        </a>
      </div>
      <div className="home-video-frame">
        <iframe
          src={SETUP_TUTORIAL_EMBED_URL}
          title="BlackArrow setup tutorial"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </article>
  );
}
