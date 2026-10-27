// The (NASA) mark. Every spoken line and every streamed answer ends with it: the parentheses are plain and
// only the word NASA is underlined, because the link is the promise of provenance, not a piece of the copy.
// It never navigates straight out - the click goes to the leave-site dialog, which is the visitor's call to
// make. stopPropagation keeps a tap on the mark from also tapping the caption it sits inside.
export default function NasaLink({ source, name, onLeave }) {
  return (
    <a
      className='nasa-link'
      href={source}
      aria-label={`NASA source for ${name}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onLeave(source, name);
      }}
    >
      (<span>NASA</span>)
    </a>
  );
}
