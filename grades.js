export const GRADE_NAMES={1:'一年级',2:'二年级',3:'三年级',4:'四年级',5:'五年级',6:'六年级',7:'七年级',8:'八年级',9:'九年级'};
export const STAGE_NAMES={low:'一、二年级',mid:'三、四年级',high:'五、六年级',junior:'七至九年级'};
export const stageForGrade=grade=>Number.isInteger(grade)&&grade>=1&&grade<=9?(grade>=7?'junior':['low','mid','high'][Math.floor((grade-1)/2)]):null;
