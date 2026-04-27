export default function HeavyButton() {
  const data = '{}';
  return (
    <button onClick={() => { for (let i = 0; i < 1000; i++) { JSON.parse(data); } }}>
      Click
    </button>
  );
}
