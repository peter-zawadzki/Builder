import svgPaths from "./svg-nvxq60xwy8";
import imgImageYullrLogo from "figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png";

function ImageYullrLogo() {
  return (
    <div className="h-[72px] relative shrink-0 w-[192px]" data-name="Image (YULLR Logo)">
      <img alt="" className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 max-w-none object-contain pointer-events-none size-full" src={imgImageYullrLogo} />
    </div>
  );
}

function Container3() {
  return (
    <div className="h-[47.996px] relative shrink-0 w-[127.996px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pl-[-32.059px] pr-[-31.939px] relative size-full">
        <ImageYullrLogo />
      </div>
    </div>
  );
}

function Container2() {
  return (
    <div className="absolute content-stretch flex h-[47.996px] items-start justify-center left-[31.99px] px-[126.838px] top-[31.99px] w-[381.673px]" data-name="Container">
      <Container3 />
    </div>
  );
}

function Heading() {
  return (
    <div className="absolute h-[47.059px] left-[31.99px] top-[111.97px] w-[381.673px]" data-name="Heading 1">
      <p className="-translate-x-1/2 absolute font-['Inter:Medium',sans-serif] font-medium leading-[48px] left-[191.05px] not-italic text-[#0a0a0a] text-[32px] text-center top-[-0.29px] tracking-[0.4063px] whitespace-nowrap">Yullr Portal</p>
    </div>
  );
}

function PrimitiveLabel() {
  return (
    <div className="content-stretch flex h-[15.294px] items-center relative shrink-0 w-full" data-name="Primitive.label">
      <p className="font-['Inter:Medium',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#0a0a0a] text-[16px] tracking-[-0.3125px] whitespace-nowrap">Username</p>
    </div>
  );
}

function Input() {
  return (
    <div className="bg-[#f3f3f5] h-[47.996px] relative rounded-[8px] shrink-0 w-full" data-name="Input">
      <div aria-hidden="true" className="absolute border-[1.176px] border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none rounded-[8px]" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center px-[12px] py-[4px] relative size-full">
          <p className="font-['Inter:Regular',sans-serif] font-normal leading-[24px] not-italic relative shrink-0 text-[#0a0a0a] text-[16px] tracking-[-0.3125px] whitespace-nowrap">Enter your username</p>
        </div>
      </div>
    </div>
  );
}

function Container4() {
  return (
    <div className="content-stretch flex flex-col gap-[7.996px] h-[71.287px] items-start relative shrink-0 w-full" data-name="Container">
      <PrimitiveLabel />
      <Input />
    </div>
  );
}

function PrimitiveLabel1() {
  return (
    <div className="content-stretch flex h-[15.294px] items-center relative shrink-0 w-full" data-name="Primitive.label">
      <p className="font-['Inter:Medium',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#0a0a0a] text-[16px] tracking-[-0.3125px] whitespace-nowrap">Password</p>
    </div>
  );
}

function Input1() {
  return (
    <div className="absolute bg-[#f3f3f5] content-stretch flex h-[47.996px] items-center left-0 pl-[12px] pr-[40px] py-[4px] rounded-[8px] top-0 w-[381.673px]" data-name="Input">
      <div aria-hidden="true" className="absolute border-[1.176px] border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none rounded-[8px]" />
      <p className="font-['Inter:Regular',sans-serif] font-normal leading-[24px] not-italic relative shrink-0 text-[#0a0a0a] text-[16px] tracking-[-0.3125px] whitespace-nowrap">Enter your password</p>
    </div>
  );
}

function Icon() {
  return (
    <div className="h-[15.993px] overflow-clip relative shrink-0 w-full" data-name="Icon">
      <div className="absolute inset-[20.84%_8.33%]" data-name="Vector">
        <div className="absolute inset-[-7.14%_-5%]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 14.6606 10.6609">
            <path d={svgPaths.pb1ea340} id="Vector" stroke="var(--stroke-0, #717182)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33272" />
          </svg>
        </div>
      </div>
      <div className="absolute inset-[37.5%]" data-name="Vector">
        <div className="absolute inset-[-16.67%]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 5.33088 5.33088">
            <path d={svgPaths.p8648380} id="Vector" stroke="var(--stroke-0, #717182)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33272" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Button() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-[353.69px] size-[15.993px] top-[16.05px]" data-name="Button">
      <Icon />
    </div>
  );
}

function Container6() {
  return (
    <div className="h-[47.996px] relative shrink-0 w-full" data-name="Container">
      <Input1 />
      <Button />
    </div>
  );
}

function Container5() {
  return (
    <div className="content-stretch flex flex-col gap-[7.996px] h-[71.287px] items-start relative shrink-0 w-full" data-name="Container">
      <PrimitiveLabel1 />
      <Container6 />
    </div>
  );
}

function Button1() {
  return (
    <div className="bg-[#ff5c39] h-[47.996px] relative rounded-[8px] shrink-0 w-full" data-name="Button">
      <p className="-translate-x-1/2 absolute font-['Inter:Medium',sans-serif] font-medium leading-[24px] left-[191.5px] not-italic text-[16px] text-center text-white top-[11.58px] tracking-[-0.3125px] whitespace-nowrap">Log in</p>
    </div>
  );
}

function Form() {
  return (
    <div className="absolute content-stretch flex flex-col gap-[23.989px] h-[238.548px] items-start left-[31.99px] top-[191.01px] w-[381.673px]" data-name="Form">
      <Container4 />
      <Container5 />
      <Button1 />
    </div>
  );
}

function Button2() {
  return (
    <div className="absolute h-[22.353px] left-[163.64px] top-[446.73px] w-[118.346px]" data-name="Button">
      <p className="-translate-x-1/2 absolute font-['Inter:Medium',sans-serif] font-medium leading-[22.857px] left-[59.5px] not-italic text-[#307fe2] text-[16px] text-center top-[-0.82px] tracking-[-0.3125px] whitespace-nowrap">Recover access</p>
    </div>
  );
}

function Container1() {
  return (
    <div className="absolute bg-white border-[1.176px] border-[rgba(0,0,0,0.1)] border-solid h-[503.419px] left-0 rounded-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_0px_rgba(0,0,0,0.1)] top-0 w-[447.996px]" data-name="Container">
      <Container2 />
      <Heading />
      <Form />
      <Button2 />
    </div>
  );
}

function Paragraph() {
  return (
    <div className="absolute h-[20px] left-0 top-[535.4px] w-[447.996px]" data-name="Paragraph">
      <p className="-translate-x-1/2 absolute font-['Inter:Regular',sans-serif] font-normal leading-[21px] left-[224.71px] not-italic text-[#6a7282] text-[14px] text-center top-[-0.82px] tracking-[-0.1504px] whitespace-nowrap">YULLR Inc. ©2026</p>
    </div>
  );
}

function Paragraph1() {
  return (
    <div className="h-[15.294px] relative shrink-0 w-[192.132px]" data-name="Paragraph">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start relative size-full">
        <p className="font-['Inter:Regular',sans-serif] font-normal leading-[16px] not-italic relative shrink-0 text-[#027368] text-[12px] whitespace-nowrap">Preview roles (development only)</p>
      </div>
    </div>
  );
}

function Button3() {
  return (
    <div className="h-[18.824px] relative shrink-0 w-[42.61px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start relative size-full">
        <p className="font-['Inter:Medium',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#027368] text-[14px] text-center tracking-[-0.1504px] whitespace-nowrap">Admin</p>
      </div>
    </div>
  );
}

function Text() {
  return (
    <div className="h-[23.529px] relative shrink-0 w-[7.408px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[24px] left-0 not-italic text-[#027368] text-[16px] top-[-0.65px] tracking-[-0.3125px] whitespace-nowrap">•</p>
      </div>
    </div>
  );
}

function Button4() {
  return (
    <div className="h-[18.824px] relative shrink-0 w-[31.71px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start relative size-full">
        <p className="font-['Inter:Medium',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#027368] text-[14px] text-center tracking-[-0.1504px] whitespace-nowrap">User</p>
      </div>
    </div>
  );
}

function Text1() {
  return (
    <div className="h-[23.529px] relative shrink-0 w-[7.408px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[24px] left-0 not-italic text-[#027368] text-[16px] top-[-0.65px] tracking-[-0.3125px] whitespace-nowrap">•</p>
      </div>
    </div>
  );
}

function Button5() {
  return (
    <div className="h-[18.824px] relative shrink-0 w-[46.066px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start relative size-full">
        <p className="font-['Inter:Medium',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#027368] text-[14px] text-center tracking-[-0.1504px] whitespace-nowrap">Viewer</p>
      </div>
    </div>
  );
}

function Container8() {
  return (
    <div className="h-[23.529px] relative shrink-0 w-[199.173px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[15.993px] items-center justify-center relative size-full">
        <Button3 />
        <Text />
        <Button4 />
        <Text1 />
        <Button5 />
      </div>
    </div>
  );
}

function Container7() {
  return (
    <div className="absolute bg-[#edf5f4] content-stretch flex flex-col gap-[7.996px] h-[80px] items-center justify-center left-0 pb-[16.599px] pt-[16.581px] rounded-[10px] top-[688.73px] w-[447.996px]" data-name="Container">
      <Paragraph1 />
      <Container8 />
    </div>
  );
}

function Container() {
  return (
    <div className="h-[768.732px] relative shrink-0 w-[447.996px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Container1 />
        <Paragraph />
        <Container7 />
      </div>
    </div>
  );
}

function LoginPage() {
  return (
    <div className="bg-[#f9fafb] h-[768.732px] relative shrink-0 w-full" data-name="LoginPage">
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center pl-[385.993px] pr-[386.011px] relative size-full">
          <Container />
        </div>
      </div>
    </div>
  );
}

export default function PocYullrAdminPortal() {
  return (
    <div className="bg-white content-stretch flex flex-col items-start relative size-full" data-name="POC: Yullr admin portal">
      <LoginPage />
    </div>
  );
}