import { ArrowRight } from "lucide-react";
import Image from "next/image";

interface ICard {
  number: string | number;
  title: string;
  description: string;
  button: string;
  note?: boolean;
}

export default function Card({
  number,
  title,
  description,
  button,
  note,
}: ICard) {
  return (
    <div className="backdrop-blur-md bg-white/5 p-4 sm:p-5 lg:p-6 rounded-lg border border-[#FFB79B] h-auto min-h-[200px] sm:min-h-[240px] lg:h-[270px] w-full sm:w-[480px] lg:w-[550px] flex flex-col">
      <div className="flex items-start gap-4">
        <div className="text-orange-500 text-3xl font-bold">{number}</div>
        <div className="items-center">
          <h3 className="text-white text-[27px] -mt-1 font-bold">{title}</h3>
          <p className="text-gray-400 max-w-md text-[15px] mt-1">
            {description}
          </p>
        </div>
      </div>
      {note ? (
        <div className="mx-7 mt-2 flex flex-row space-x-2">
          <Image
            src="/info-line.svg"
            height={24}
            width={24}
            alt="information-icon"
            className="h-[24px] w-[24px] place-self-center"
          />
          <p className="text-[12px] text-[#64FFAA80]/50">
            Tokens are auto-released to your wallet as soon as the unlock time
            is reached.
          </p>
        </div>
      ) : null}
      <button className="cursor-pointer w-full bg-orange-500/10 text-orange-500 py-3 px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-medium hover:bg-orange-500/20 transition-colors mt-auto">
        {button}
        <ArrowRight size={14} />
      </button>
    </div>
  );
}
