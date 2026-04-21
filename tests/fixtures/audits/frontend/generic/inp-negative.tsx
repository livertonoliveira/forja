function handleClick() {
  // lightweight handler
}

export default function SimpleButton() {
  return (
    <button onClick={() => handleClick()}>
      Click
    </button>
  );
}
