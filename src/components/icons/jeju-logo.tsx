export function JejuLogo(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			<circle
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="2"
				fill="none"
			/>
			<path
				d="M7 12 L12 7 L17 12 L12 17 Z"
				fill="currentColor"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinejoin="round"
			/>
			<circle cx="12" cy="12" r="2" fill="white" />
		</svg>
	);
}



