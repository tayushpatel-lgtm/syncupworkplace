import './globals.css';

export const metadata = {
  title: 'Syncup',
  description: 'Team operations — the working day, tasks, attendance and leave in one place.',
};

// The product is built for laptops and tablets. Phones get a wall, not a layout.
export const viewport = {
  width: 1024,
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="phone-block">
          <div>
            <b>SYNCUP</b>
            <p>
              Syncup is built for laptops and tablets. Open it on a wider screen — there is no phone
              layout, by design.
            </p>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
