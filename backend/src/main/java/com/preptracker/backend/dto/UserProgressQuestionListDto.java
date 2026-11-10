package com.preptracker.backend.dto;

import java.util.ArrayList;
import java.util.List;

public class UserProgressQuestionListDto {
    private Data data;
    private List<GraphQlError> errors = new ArrayList<>();

    public static class Data {
        private QuestionList userProgressQuestionList;

        public QuestionList getUserProgressQuestionList() { return userProgressQuestionList; }
        public void setUserProgressQuestionList(QuestionList userProgressQuestionList) { this.userProgressQuestionList = userProgressQuestionList; }
    }

    public static class QuestionList {
        private int totalNum;
        private List<Question> questions = new ArrayList<>();

        public int getTotalNum() { return totalNum; }
        public void setTotalNum(int totalNum) { this.totalNum = totalNum; }
        public List<Question> getQuestions() { return questions; }
        public void setQuestions(List<Question> questions) { this.questions = questions; }
    }

    public static class Question {
        private String frontendId;
        private String title;
        private String titleSlug;
        private String difficulty;
        private String lastSubmittedAt;
        private List<TopicTag> topicTags = new ArrayList<>();

        public String getFrontendId() { return frontendId; }
        public void setFrontendId(String frontendId) { this.frontendId = frontendId; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getTitleSlug() { return titleSlug; }
        public void setTitleSlug(String titleSlug) { this.titleSlug = titleSlug; }
        public String getDifficulty() { return difficulty; }
        public void setDifficulty(String difficulty) { this.difficulty = difficulty; }
        public String getLastSubmittedAt() { return lastSubmittedAt; }
        public void setLastSubmittedAt(String lastSubmittedAt) { this.lastSubmittedAt = lastSubmittedAt; }
        public List<TopicTag> getTopicTags() { return topicTags; }
        public void setTopicTags(List<TopicTag> topicTags) { this.topicTags = topicTags; }
    }

    public static class TopicTag {
        private String name;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
    }

    public Data getData() { return data; }
    public void setData(Data data) { this.data = data; }
    public List<GraphQlError> getErrors() { return errors; }
    public void setErrors(List<GraphQlError> errors) { this.errors = errors; }

    public static class GraphQlError {
        private String message;

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }
}
