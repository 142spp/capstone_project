% !TEX encoding = UTF-8 Unicode
%% pnureport.cls (report를 바탕으로 함)
%% 부산대학교 보고서 스타일 (pdfLaTeX 전용)

\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{pnureport}[2025/05/15 PNU Report class for pdfLaTeX]

\LoadClass[11pt,a4paper]{report} % 기본 클래스 로드

% --- 패키지 설정 ---
\RequirePackage{kotex}                % 한글 지원
\RequirePackage{indentfirst}          % 한글에 맞는, 첫 행 들여쓰기
\RequirePackage{amsmath}              % AMS 수학 기호
\RequirePackage{geometry}             % 여백 설정
\RequirePackage{setspace}             % 줄간격
\RequirePackage{graphicx}             % 그림 삽입
\RequirePackage{fancyhdr}             % 머리말/꼬리말
\RequirePackage{url}                  % url 설정 명령어
\RequirePackage{listings}             % 코드 삽입
\RequirePackage{makeidx}              % 색인 삽입


% --- 여백 설정 ---
\geometry{left=3cm,right=3cm,top=3cm,bottom=3cm}

% --- 줄간격 설정 ---
% \onehalfspacing
\setstretch{1.5}

% --- 제목 구성 ---
\newcommand{\reporttitle}[1]{\def\@reporttitle{#1}}
\newcommand{\reportteam}[1]{\def\@reportteam{#1}}
\newcommand{\reportauthor}[1]{\def\@reportauthor{#1}}
\newcommand{\reportdate}[1]{\def\@reportdate{#1}}
\newcommand{\reportadvisor}[1]{\def\@reportadvisor{#1}}

\def\maketitle{
  \begin{titlepage}
    \centering
    \vspace*{2cm}
    {\LARGE \sffamily \bfseries \@reporttitle \par}\vspace{2.5cm}
    \centerline{\includegraphics[width=0.37\linewidth]{pnulogo}}\vspace{1.5cm}
    {\Large 팀명: \@reportteam \par}\vspace{0.1cm}
    {\large \@reportauthor \par}\vspace{0.7cm}
    {\large 지도교수: \@reportadvisor \par}\vspace{0.7cm}
    {\large 제출일: \@reportdate \par}
    \vfill
    {\large 부산대학교 \par}
  \end{titlepage}
  \thispagestyle{empty}
  \clearpage
}

% --- 목차 제목 변경 ---
\renewcommand{\contentsname}{목차}

% --- 장 제목 형식 변경 (제1장) ---
\renewcommand{\chaptername}{} % 빈 문자열로 설정해 불필요한 출력 방지
\renewcommand{\thechapter}{\arabic{chapter}} % 숫자만 유지

% --- 제목 형식 조정 ---
\def\@makechapterhead#1{%
  \vspace*{50\p@}%
  {\parindent \z@ \raggedright \normalfont
    \LARGE\bfseries 제\thechapter 장\quad #1\par\nobreak
    \vskip 40\p@
  }}
\def\@makeschapterhead#1{%
  \vspace*{50\p@}%
  {\parindent \z@ \raggedright \normalfont
    \LARGE\bfseries #1\par\nobreak
    \vskip 40\p@
  }}

% --- 그림 및 표 이름 변경 ---
\renewcommand{\figurename}{그림}
\renewcommand{\tablename}{표}

% --- 참고문헌 제목 변경 ---
\renewcommand{\bibname}{참고문헌}

% --- 색인 제목 변경 ---
\renewcommand{\indexname}{찾아보기}

% --- 코드 리스팅 제목 변경 ---
\renewcommand{\lstlistingname}{코드}

% --- 페이지 스타일 ---
\setlength{\headheight}{14pt}
\pagestyle{fancy}
\fancyhf{}
\rhead{\leftmark}
\lhead{\@reportteam}
\cfoot{\thepage}

% --- 기본값 설정 ---
\reporttitle{보고서 제목}
\reportteam{모둠 이름}
\reportauthor{작성자 이름}
\reportadvisor{지도교수 이름}
\reportdate{\today}

\endinput

