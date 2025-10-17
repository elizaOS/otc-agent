interface ICard {
  number: string | number;
  title: string;
  description: string;
  button: string;
  onClick?: () => void;
  disabled?: boolean;
}

export default function Card({
  number,
  title,
  description,
  button,
  onClick,
  disabled,
}: ICard) {
  return (
    <div className="backdrop-blur-md bg-white/5 p-4 sm:p-5 lg:p-6 rounded-lg border border-[#FFB79B] h-auto min-h-[200px] sm:min-h-[240px] lg:h-[270px] w-full xl:flex-1 flex flex-col">
      <div className="flex items-start gap-4">
        <div className="text-orange-500 text-3xl font-bold">{number}</div>
        <div className="items-center">
          <h3 className="text-white text-[27px] -mt-1 font-bold">{title}</h3>
          <p className="text-gray-400 max-w-md text-[15px] mt-1">
            {description}
          </p>
        </div>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className={
          disabled
            ? "w-full bg-blue-500/10 text-blue-500 py-3 px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-medium mt-auto"
            : "cursor-pointer w-full bg-orange-500/10 text-orange-500 py-3 px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-medium hover:bg-orange-500/20 transition-colors mt-auto"
        }
      >
        {button}
      </button>
    </div>
  );
}
