% Documentclass pfpe-manual.cls last updated - 2023-10-26
% based on the seismica publication class and an overleaf manual template

\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{pfpe-manual}[2023 July manual template]

% set default smaller margins, separated paragraphs, bigger line spacing
% (fullpage used as fallback if geometry package removed from main preamble)
\RequirePackage{fullpage,parskip}
\linespread{1.5}

% load the base class with default options
\LoadClass[12pt,letterpaper]{article}

% some useful things, including math font
\RequirePackage{listings}
\RequirePackage{xcolor}
\RequirePackage{newunicodechar}
\RequirePackage{lmodern}
\RequirePackage{amsmath}   % for equations and mathematics
\RequirePackage{url}
\def\UrlBreaks{\do\/\do-\do_}

\RequirePackage{tabularx}

% source sans for fonts
\RequirePackage{fontspec}
\RequirePackage[autostyle=false, style=english]{csquotes}
\RequirePackage[opentype,default,tabular,lining]{sourcesanspro}
%\RequirePackage[opentype,default,tabular,lining]{sourceserifpro}
\RequirePackage[opentype,lining]{sourcecodepro}
\newcommand{\sff}{\sourcesanspro}
%\newcommand{\rmf}{\sourceserifpro}
\newcommand{\sflight}{\sourcesansprolight}
%\newcommand{\rmlight}{\sourceserifprolight}
\urlstyle{sf}

% citations
\RequirePackage[round]{natbib}
\bibliographystyle{abbrvnat}

% extra front matter commands for logo and version
\DeclareRobustCommand*{\softwarelogo}[1]{\gdef\@logocmd{#1}}
\DeclareRobustCommand*{\version}[1]{\gdef\@ver{Version #1}}
\DeclareRobustCommand*{\license}[1]{\gdef\@lic{Licensed under #1}}

% default values
\gdef\@logocmd{\@latex@warning{No logo command specified for title page. Ignoring.}}
\gdef\@ver{\@latex@warning{No version number specified for title page. Ignoring.}}
\gdef\@lic{\@latex@warning{No license specified for title page. Ignoring.}}

% modify the stock \maketitle command
\renewcommand\maketitle{
\begin{titlepage}
\centering
\@logocmd\par
{\huge\bfseries\sff\@title\par}
\bigskip
{\Large\@ver\par}
\vfill
{\Large Contributors: \@author\par} \vspace*{4pt}
{Last updated \@date\par} \vspace*{6pt}
{\small \@lic\par}
\end{titlepage}
}

% section header config
\RequirePackage{titlesec}
\titleformat{\section}{\fontsize{14pt}{1em}\bfseries\sff}{\thesection}{1em}{}
\titleformat{\subsection}{\fontsize{12pt}{0.3em}\bfseries\sff}{\thesubsection}{1em}{}
\titleformat{\subsubsection}{\fontsize{11pt}{0.1em}\bfseries\sff}{\thesubsubsection}{1em}{}


% code and hyperref config
\definecolor{seismicacolor1light}{RGB}{38,81,143}
\definecolor{seismicacolor1}{RGB}{18,52,103}
\definecolor{seismicacolor2}{RGB}{77,185,123}
\definecolor{seismicacolor3}{RGB}{222,60,75}
\definecolor{seismicacolor4}{RGB}{205,204,36}
\definecolor{codebackcolor}{RGB}{243,243,243}

\RequirePackage[unicode,
bookmarks=true,
linkcolor=seismicacolor1light,
citecolor=seismicacolor1light,
hidelinks,
hyperfootnotes=false]{hyperref}
\hypersetup{colorlinks,linkcolor=seismicacolor1light}
\hypersetup{colorlinks,citecolor=seismicacolor1light}
\hypersetup{colorlinks,urlcolor=gray}
\RequirePackage{url}
\def\UrlBreaks{\do\/\do-\do_}

% in-line code words
\def\code#1{\fontsize{9}{10}\colorbox{codebackcolor}{\texttt{#1}}}
\setlength{\fboxsep}{1pt}

% listings for code
\lstset{
	tabsize=4,
	captionpos=t,
	breaklines=true,
	showstringspaces=false,
	basicstyle=\fontsize{9}{10}\ttfamily,
	keywordstyle=\color{seismicacolor2},
	commentstyle=\color{gray},
	stringstyle=\color{seismicacolor1},
	emphstyle=\color{seismicacolor3},
	%	frameshape={RYR}{Y}{Y}{RYR},
	backgroundcolor=\color{codebackcolor},   
	rulecolor=\color{codebackcolor}
}

% config for references and dois
\RequirePackage{doi}
\setlength{\bibsep}{3pt} %espacement entre les references biblio
\renewcommand{\bibsection}{\section*{References}}
\def\bibfont{\small\sffamily}
\renewcommand*{\doi}[1]{doi: \href{http://doi.org/#1}{#1}}
